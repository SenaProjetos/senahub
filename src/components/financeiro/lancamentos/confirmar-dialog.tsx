"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { confirmarLancamento, adicionarAnexoLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMoeda } from "@/lib/moeda";
import { diaDeSaoPaulo } from "@/lib/data";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { planejarBaixa } from "@/modules/financeiro/lancamentos/baixa";
import { brl, formatarData } from "@/lib/utils";
import {
  DIAS_PADRAO,
  MOTIVO_RETENCAO_DESCONTO,
  MOTIVO_RETENCAO_SEM_CONTA,
  ROTULO_IMPOSTO,
  motivoRetencaoParcial,
  planejarRetencoesNaBaixa,
  type DiasDeVencimento,
  type ImpostoRetido,
} from "@/modules/financeiro/lancamentos/retencoes";

const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const NONE = "__none";

export function ConfirmarDialog({
  lancamento,
  onClose,
  contas,
  formas,
  diasRetencao = DIAS_PADRAO,
}: {
  lancamento: LancamentoItem | null;
  onClose: () => void;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
  /** C4: dia de vencimento de cada imposto retido (Configurações do Financeiro). */
  diasRetencao?: DiasDeVencimento;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Dia de São Paulo: `toISOString()` é UTC e, depois das 21h, a data padrão da baixa virava amanhã.
  const hoje = diaDeSaoPaulo();
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [dataConf, setDataConf] = useState(hoje);
  const [valorEfetivo, setValorEfetivo] = useState<number | null>(null);
  // M7: acréscimos e abatimento da baixa, separados do valor do título.
  const [juros, setJuros] = useState<number | null>(null);
  const [multa, setMulta] = useState<number | null>(null);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [comprovante, setComprovante] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ao abrir para um lançamento, pré-preenche o valor com o total (paga tudo por padrão).
  const lancKey = lancamento?.id ?? "";
  const [prevKey, setPrevKey] = useState(lancKey);
  if (prevKey !== lancKey) {
    setPrevKey(lancKey);
    setValorEfetivo(lancamento ? Number(lancamento.valor) : null);
    setContaId(NONE);
    setFormaId(NONE);
    setDataConf(hoje);
    setComprovante(null);
    setJuros(null);
    setMulta(null);
    setDesconto(null);
  }

  const total = lancamento ? Number(lancamento.valor) : 0;
  const cent = (v: number | null) => Math.round((v ?? 0) * 100);
  // C4: retenção na nota — o banco movimenta o líquido e, na conta a pagar, nasce uma conta por imposto.
  const retencoes = (lancamento?.retencoes ?? []).map((r) => ({ imposto: r.imposto as ImpostoRetido, valorCentavos: cent(r.valor) }));
  const comRetencao = retencoes.length > 0;
  const planoRetencao =
    lancamento && comRetencao ? planejarRetencoesNaBaixa({ tipo: lancamento.tipo, retencoes, diaPagamento: dataConf || hoje, dias: diasRetencao }) : null;
  const retido = planoRetencao?.retidoCentavos ?? 0;
  // O mesmo puro do servidor: o que sai da conta, o resto em aberto e cada acessório, antes de confirmar.
  const plano = lancamento
    ? planejarBaixa({ tipo: lancamento.tipo, valor: cent(total), principal: valorEfetivo == null ? null : cent(valorEfetivo), juros: cent(juros), multa: cent(multa), desconto: cent(desconto) })
    : null;
  const temConta = contaId !== NONE || !!lancamento?.contaId;
  const erro =
    plano && "erro" in plano
      ? plano.erro
      : (juros || multa || desconto) && !temConta
        ? "Juros, multa e desconto precisam da conta do pagamento: escolha a conta."
        : comRetencao && !temConta
          ? MOTIVO_RETENCAO_SEM_CONTA
          : comRetencao && plano && !("erro" in plano) && plano.caixa - retido < 0
            ? MOTIVO_RETENCAO_DESCONTO
            : null;
  const restante = plano && !("erro" in plano) && plano.restante ? plano.restante / 100 : 0;
  const caixa = plano && !("erro" in plano) ? (plano.caixa - retido) / 100 : 0;
  const temAcessorio = !!(juros || multa || desconto);
  const verbo = lancamento?.tipo === "receita" ? "Entra na" : "Sai da";

  function confirmar() {
    if (!lancamento) return;
    const lancId = lancamento.id;
    start(async () => {
      // O comprovante vai ANTES da baixa: com "Exigir comprovante" ligado (M10), o servidor recusa a baixa
      // de um lançamento sem anexo. Se o envio falha, a baixa não é tentada.
      if (comprovante) {
        try {
          const fd = new FormData();
          fd.set("file", comprovante);
          const up = await fetch("/api/financeiro/lancamentos/anexo", { method: "POST", body: fd });
          const meta = await up.json();
          if (!up.ok) {
            toast.error(meta.error ?? "Comprovante não anexado.");
            return;
          }
          const a = await adicionarAnexoLancamento({ lancamentoId: lancId, meta });
          if (!a.ok) {
            toast.error(a.error);
            return;
          }
        } catch {
          toast.error("Falha ao anexar comprovante.");
          return;
        }
      }
      const r = await confirmarLancamento({
        id: lancId,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        dataConfirmacao: dataConf,
        principal: valorEfetivo != null && valorEfetivo < total ? valorEfetivo : undefined,
        juros: juros ?? undefined,
        multa: multa ?? undefined,
        desconto: desconto ?? undefined,
      });
      if (!r.ok) {
        toast.error(comprovante ? `${r.error} O comprovante ficou anexado.` : r.error);
        setComprovante(null);
        router.refresh();
        return;
      }
      if (r.data.restante != null) {
        toast.success(`Confirmado. Saldo de ${brl(r.data.restante)} ficou em aberto.`);
      } else if (r.data.impostosARecolher > 0) {
        toast.success(
          `Pago. ${r.data.impostosARecolher === 1 ? "Nasceu 1 conta de imposto retido" : `Nasceram ${r.data.impostosARecolher} contas de imposto retido`} — veja em Contas → Impostos retidos.`,
        );
      } else {
        toast.success("Lançamento confirmado.");
      }
      setComprovante(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{comRetencao ? (lancamento?.tipo === "receita" ? "Receber conta" : "Pagar conta") : "Confirmar lançamento"}</DialogTitle>
          <DialogDescription>
            {lancamento?.descricao} — entra no caixa e na DRE ao confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta bancária</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bx-principal">Valor do título quitado</Label>
              <InputMoeda
                id="bx-principal"
                placeholder={lancamento ? formatarMoeda(total) : undefined}
                value={valorEfetivo}
                onChange={setValorEfetivo}
                // Retenção é sobre a nota toda: pagamento parcial não existe aqui (o servidor recusa igual).
                disabled={comRetencao}
                title={comRetencao && lancamento ? motivoRetencaoParcial(lancamento.tipo) : undefined}
                aria-describedby={comRetencao ? "bx-parcial-motivo" : undefined}
              />
            </div>
          </div>
          {comRetencao && lancamento && (
            <p id="bx-parcial-motivo" className="text-xs text-muted-foreground">
              {motivoRetencaoParcial(lancamento.tipo)}
            </p>
          )}
          {planoRetencao && lancamento && renderRetencao()}
          {restante > 0 && (
            <p className="text-xs text-warning">
              Pagamento parcial: {brl(restante)} ficará em aberto como uma nova {lancamento?.tipo === "receita" ? "conta a receber" : "conta a pagar"}.
            </p>
          )}
          <CollapsibleSection
            titulo="Juros, multa e desconto"
            resumo={temAcessorio && plano && !("erro" in plano) ? `${verbo.toLowerCase()} conta ${brl(caixa)}` : undefined}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
              <div className="space-y-1.5">
                <Label htmlFor="bx-juros">Juros</Label>
                <InputMoeda id="bx-juros" value={juros} onChange={setJuros} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-multa">Multa</Label>
                <InputMoeda id="bx-multa" value={multa} onChange={setMulta} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-desconto">Desconto</Label>
                <InputMoeda id="bx-desconto" value={desconto} onChange={setDesconto} />
              </div>
            </div>
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              Cada um vira um lançamento próprio na DRE ({lancamento?.tipo === "receita" ? "juros recebidos são receita, desconto concedido é despesa" : "juros e multa são despesa financeira, desconto obtido é receita"}); o título fica com o valor dele. Desconto só quitando o título inteiro.
            </p>
          </CollapsibleSection>
          {temAcessorio && plano && !("erro" in plano) && (
            <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>{verbo} conta: {brl(caixa)}</b> — título {brl((total - restante))}
              {retido ? ` − retido ${brl(retido / 100)}` : ""}
              {juros || multa ? ` + juros e multa ${brl((juros ?? 0) + (multa ?? 0))}` : ""}
              {desconto ? ` − desconto ${brl(desconto)}` : ""}.
            </p>
          )}
          {erro && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {erro}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Comprovante (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-3.5" /> {comprovante ? comprovante.name : "Anexar comprovante"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !!erro}>
            {pending ? "Confirmando…" : comRetencao ? `${lancamento?.tipo === "receita" ? "Receber" : "Pagar"} ${brl(caixa)}` : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  /** Mock C4 "Pagar conta com retenção" / "Receber nota com retenção do cliente". */
  function renderRetencao() {
    if (!planoRetencao || !lancamento) return null;
    const despesa = lancamento.tipo === "despesa";
    return (
      <div className="space-y-2 rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
          <dt>Valor da nota</dt>
          <dd className="text-right font-mono tabular-nums">{brl(total)}</dd>
          {retencoes.map((r) => (
            <div key={r.imposto} className="contents text-muted-foreground">
              <dt>
                − {ROTULO_IMPOSTO[r.imposto]} retido{despesa ? "" : " pelo cliente"}
              </dt>
              <dd className="text-right font-mono tabular-nums">{brl(r.valorCentavos / 100)}</dd>
            </div>
          ))}
          {(juros || multa) && (
            <>
              <dt className="text-muted-foreground">+ juros e multa</dt>
              <dd className="text-right font-mono tabular-nums text-muted-foreground">{brl((juros ?? 0) + (multa ?? 0))}</dd>
            </>
          )}
          {desconto ? (
            <>
              <dt className="text-muted-foreground">− desconto</dt>
              <dd className="text-right font-mono tabular-nums text-muted-foreground">{brl(desconto)}</dd>
            </>
          ) : null}
          <dt className="border-t pt-0.5 font-semibold">{despesa ? "Sai do banco" : "Entra no banco"}</dt>
          <dd className="border-t pt-0.5 text-right font-mono font-semibold tabular-nums">{brl(caixa)}</dd>
        </dl>
        {despesa ? (
          <div className="space-y-1">
            <p>
              Ao pagar, {planoRetencao.aRecolher.length === 1 ? "nasce 1 conta a pagar" : `nascem ${planoRetencao.aRecolher.length} contas a pagar`} (impostos que a empresa
              recolhe no lugar do fornecedor):
            </p>
            <ul className="divide-y rounded-sm border bg-card">
              {planoRetencao.aRecolher.map((x) => {
                const dia = new Date(`${x.vencimento}T12:00:00.000Z`).getUTCDay();
                const fimDeSemana = dia === 0 || dia === 6;
                return (
                  <li key={x.imposto} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 py-1">
                    <span>
                      {x.rotulo}
                      {lancamento.fornecedor?.nome ? ` — ${lancamento.fornecedor.nome}` : ""}
                      {lancamento.numeroDocumento ? ` ${lancamento.numeroDocumento}` : ""}
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      vence {formatarData(x.vencimento)} · {brl(x.valorCentavos / 100)}
                    </span>
                    {fimDeSemana && (
                      <span className="w-full text-xs text-warning">Cai num {DIA_DA_SEMANA[dia]}: a data não anda sozinha — confira o vencimento da guia.</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Vencimento: dia do imposto no mês seguinte ao do pagamento (Configurações do Financeiro).</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            O retido vira imposto a compensar: quem recolhe é o cliente, e o contador desconta do DAS. Não nasce conta a pagar nem a receber.
          </p>
        )}
      </div>
    );
  }
}
