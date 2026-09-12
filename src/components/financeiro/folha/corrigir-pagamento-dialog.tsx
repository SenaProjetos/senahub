"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { corrigirPagamentoEfetivado } from "@/modules/financeiro/folha/actions";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { MSG_CONTA_OBRIGATORIA } from "@/modules/financeiro/folha/status";
import { erroCorrecaoConciliada } from "@/modules/financeiro/folha/service";
import { useFieldErrors } from "@/lib/use-field-errors";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NONE = "__none";
const MIN_JUSTIFICATIVA = 10;
type Opcao = { id: string; nome: string };

/**
 * yyyy-mm-dd de uma data gravada como meia-noite UTC (`@db.Date`, `quandoDoPagamento`).
 * Getters UTC de propósito — os locais dariam o dia ANTERIOR em BRT. (O inverso do
 * `hojeLocal` do dialog de pagar, que lê "hoje" e por isso usa os locais.)
 */
function diaGravado(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/**
 * A opção ATUAL entra na lista mesmo se foi desativada — as opções da tela só trazem as
 * ativas. Sem isto o Select abriria vazio, e corrigir só o valor obrigaria a escolher outra
 * conta: o dinheiro "mudaria de conta" sem ninguém ter pedido.
 */
function comAtual(opcoes: Opcao[], id: string | null, nome: string | null, rotulo: string): Opcao[] {
  if (!id || opcoes.some((o) => o.id === id)) return opcoes;
  return [...opcoes, { id, nome: `${nome ?? rotulo} (inativa)` }];
}

/**
 * Corrige um pagamento JÁ efetivado (F11/D27, N6) — todos os campos, com justificativa
 * obrigatória que fica na auditoria. Parte do que está gravado hoje (valor, conta, forma,
 * data), não de campos vazios: corrigir uma coisa não pode mexer nas outras por acidente.
 */
export function CorrigirPagamentoDialog({
  pagamento,
  contas,
  formas,
  onClose,
}: {
  pagamento: FolhaItem | null;
  contas: Opcao[];
  formas: Opcao[];
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const fe = useFieldErrors({
    valor: `${uid}-valor`,
    contaId: `${uid}-conta`,
    formaId: `${uid}-forma`,
    data: `${uid}-data`,
    observacao: `${uid}-obs`,
    justificativa: `${uid}-just`,
  });
  const [pending, start] = useTransition();
  const [valor, setValor] = useState<number | null>(null);
  const [contaId, setContaId] = useState("");
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState("");
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const l = pagamento?.lancamento ?? null;
  // Conciliada: o extrato manda (G1a). Conta e data ficam travadas no que o banco diz, e o
  // valor só pode virar o da transação — o resto é estorno, não correção de registro.
  const conciliada = l?.transacao ?? null;
  const valorExtrato = conciliada ? Math.abs(conciliada.valor) : null;
  const opcoesConta = useMemo(() => comAtual(contas, l?.contaId ?? null, l?.conta ?? null, "Conta atual"), [contas, l]);
  const opcoesForma = useMemo(() => comAtual(formas, l?.formaId ?? null, l?.forma ?? null, "Forma atual"), [formas, l]);

  // Aberto imperativamente (botão na linha) — sincroniza com o que está gravado a cada abertura.
  useEffect(() => {
    if (pagamento) {
      const t = pagamento.lancamento?.transacao ?? null;
      // Conciliada, os campos já abrem no que o extrato diz — que é o único destino que a
      // correção aceita. A descrição do dialog mostra o valor de hoje ao lado, então trocar
      // 1.500 por 1.450 aqui não é uma mudança escondida.
      setValor(t ? Math.abs(t.valor) : Number(pagamento.valor));
      setContaId(t?.contaId ?? pagamento.lancamento?.contaId ?? "");
      setFormaId(pagamento.lancamento?.formaId ?? NONE);
      setData(diaGravado(t?.data ?? pagamento.lancamento?.dataConfirmacao ?? pagamento.pagoEm));
      setObservacao(pagamento.observacao ?? "");
      setJustificativa("");
      fe.limpar();
    }
    // `fe` muda a cada render; só a troca de pagamento importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento]);

  function salvar() {
    if (!pagamento) return;
    // Botão habilitado de propósito (mesmo padrão do dialog de pagar): o erro diz POR QUÊ.
    const num = valor ?? 0;
    let ok = true;
    if (!(num > 0)) {
      fe.definir("valor", "Informe um valor maior que zero.");
      ok = false;
    }
    if (!contaId) {
      fe.definir("contaId", MSG_CONTA_OBRIGATORIA);
      ok = false;
    }
    if (!data) {
      fe.definir("data", "Informe a data do pagamento.");
      ok = false;
    }
    if (justificativa.trim().length < MIN_JUSTIFICATIVA) {
      fe.definir("justificativa", `Explique o motivo da correção (mínimo ${MIN_JUSTIFICATIVA} caracteres).`);
      ok = false;
    }
    // Mesma regra pura da action (G1a) — aqui só para o erro aparecer sob o campo em vez de
    // voltar como toast depois do round-trip.
    if (ok && conciliada) {
      const erro = erroCorrecaoConciliada(
        { valor: conciliada.valor, contaId: conciliada.contaId },
        { valor: num, contaId },
      );
      if (erro) {
        fe.definir(erro.includes("conta") ? "contaId" : "valor", erro);
        ok = false;
      }
    }
    if (!ok) return;

    start(async () => {
      const r = await corrigirPagamentoEfetivado({
        id: pagamento.id,
        valor: num,
        contaId,
        formaId: formaId === NONE ? "" : formaId,
        data,
        observacao,
        justificativa,
      });
      if (r.ok) {
        toast.success("Pagamento corrigido — lançamento do caixa atualizado.");
        onClose();
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  const cValor = fe.campo("valor");
  const cConta = fe.campo("contaId");
  const cForma = fe.campo("formaId");
  const cData = fe.campo("data");
  const cObs = fe.campo("observacao");
  const cJust = fe.campo("justificativa");

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir pagamento efetivado</DialogTitle>
          <DialogDescription>
            {pagamento && (
              <>
                {pagamento.projetista.name} — hoje: {brl(Number(pagamento.valor))} · {l?.conta ?? "sem conta"}
                {l?.forma ? ` · ${l.forma}` : ""} · pago em {formatarData(l?.dataConfirmacao ?? pagamento.pagoEm)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {conciliada && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-muted-foreground">
              Conciliado com o extrato em {formatarData(conciliada.data)}. Valor, conta e data seguem o banco e vêm
              preenchidos — aqui só dá para acertar o registro. Se o que saiu da conta foi outro, registre um estorno
              no caixa.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={cValor.id}>Valor (R$)</Label>
            <InputMoeda
              {...cValor}
              value={valor}
              onChange={(v) => {
                setValor(v);
                fe.limpar("valor");
              }}
            />
            {valorExtrato != null && <p className="text-xs text-muted-foreground">Extrato: {brl(valorExtrato)}</p>}
            <FieldError campo={cValor.id} mensagem={fe.erros.valor} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={cConta.id}>
                Conta
                <span className="text-destructive" aria-hidden>
                  {" "}*
                </span>
              </Label>
              <Select
                value={contaId || null}
                disabled={!!conciliada}
                onValueChange={(v) => {
                  setContaId(v ?? "");
                  fe.limpar("contaId");
                }}
              >
                <SelectTrigger {...cConta} aria-required className="w-full">
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {opcoesConta.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError campo={cConta.id} mensagem={fe.erros.contaId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={cForma.id}>Forma</Label>
              <Select
                value={formaId}
                onValueChange={(v) => {
                  setFormaId(v ?? NONE);
                  fe.limpar("formaId");
                }}
              >
                <SelectTrigger {...cForma} className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opcoesForma.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError campo={cForma.id} mensagem={fe.erros.formaId} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={cData.id}>Data do pagamento</Label>
            <Input
              {...cData}
              type="date"
              value={data}
              disabled={!!conciliada}
              onChange={(e) => {
                setData(e.target.value);
                fe.limpar("data");
              }}
            />
            <FieldError campo={cData.id} mensagem={fe.erros.data} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={cObs.id}>Observação</Label>
            <Input
              {...cObs}
              value={observacao}
              maxLength={500}
              onChange={(e) => {
                setObservacao(e.target.value);
                fe.limpar("observacao");
              }}
            />
            <FieldError campo={cObs.id} mensagem={fe.erros.observacao} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={cJust.id}>
              Justificativa
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            </Label>
            <textarea
              {...cJust}
              aria-required
              rows={3}
              maxLength={500}
              value={justificativa}
              onChange={(e) => {
                setJustificativa(e.target.value);
                fe.limpar("justificativa");
              }}
              placeholder="Por que este pagamento está sendo corrigido?"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
            />
            <FieldError campo={cJust.id} mensagem={fe.erros.justificativa} />
            <p className="text-xs text-muted-foreground">
              Fica registrada na auditoria, junto com os valores de antes. Pagamento já conciliado com o extrato não
              pode ser corrigido.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
