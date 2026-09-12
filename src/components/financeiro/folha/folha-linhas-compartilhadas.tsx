"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Pencil, Ban, Paperclip, Undo2, FileText } from "lucide-react";
import { gerarReciboIndividual } from "@/modules/financeiro/recibo/actions";
import {
  pagarProjetista,
  editarPagamentoProjetista,
  cancelarPagamentoProjetista,
} from "@/modules/financeiro/folha/actions";
import { temValorPagavel, erroCorrecaoEfetivado, erroEstornoEfetivado } from "@/modules/financeiro/folha/service";
import { STATUS_PAGAMENTO_TONE, STATUS_PAGAMENTO_LABEL, type FiltrosFolha } from "@/modules/financeiro/folha/status";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, cn, formatarData } from "@/lib/utils";
import { FieldError } from "@/components/ui/field-error";
import { useFieldErrors } from "@/lib/use-field-errors";
import { FolhaFiltros } from "./folha-filtros";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";
import { AnexarComprovanteDialog } from "./anexar-comprovante-dialog";

export const linkCls = "underline-offset-2 hover:underline";

export type Opcao = { id: string; nome: string };
/** Quais links a pessoa pode seguir — cada destino tem seu próprio gate de permissão. */
export type LinksFolha = { projeto: boolean; pessoa: boolean; lancamento: boolean };

export function pagavel(p: FolhaItem) {
  return p.status === "pendente" && temValorPagavel(p.valor);
}

/** Badge de status, com o caso especial "sem valor" sobrepondo o "A pagar" (F0a). */
export function BadgeStatus({ p }: { p: FolhaItem }) {
  if (p.status === "pendente" && !temValorPagavel(p.valor)) return <StatusBadge tone="danger">Sem valor</StatusBadge>;
  return (
    <StatusBadge tone={STATUS_PAGAMENTO_TONE[p.status] ?? "neutral"}>
      {STATUS_PAGAMENTO_LABEL[p.status] ?? p.status}
    </StatusBadge>
  );
}

/**
 * Botões de ação: pendente → Pagar/Corrigir valor + Editar + Cancelar; pago → "Corrigir
 * pagamento" (F11). Rótulo diferente de "Corrigir valor" de propósito: são duas ações.
 */
export function AcoesPagamento({
  p,
  onPagar,
  onEditar,
  onCorrigir,
  onEstornar,
  onComprovantes,
  onCancelado,
}: {
  p: FolhaItem;
  onPagar: (p: FolhaItem) => void;
  onEditar: (p: FolhaItem) => void;
  onCorrigir?: (p: FolhaItem) => void;
  onEstornar?: (p: FolhaItem) => void;
  onComprovantes?: (p: FolhaItem) => void;
  onCancelado?: () => void;
}) {
  if (p.status === "pago") {
    return (
      <div className="flex flex-wrap gap-1">
        {onCorrigir && <CorrigirPagamentoButton p={p} onCorrigir={onCorrigir} />}
        {onEstornar && <EstornarPagamentoButton p={p} onEstornar={onEstornar} />}
        {onComprovantes && p.lancamento && (
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title="Comprovantes deste pagamento"
            aria-label="Comprovantes deste pagamento"
            onClick={() => onComprovantes(p)}
          >
            <Paperclip className="size-3.5" />
          </Button>
        )}
        <ReciboIndividualButton p={p} />
      </div>
    );
  }
  if (p.status !== "pendente") return null;
  return (
    <div className="flex flex-wrap gap-1">
      {temValorPagavel(p.valor) ? (
        <>
          <Button size="sm" variant="outline" onClick={() => onPagar(p)}>
            <Wallet className="size-3.5" /> Pagar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title="Editar valor e observação"
            aria-label="Editar valor e observação"
            onClick={() => onEditar(p)}
          >
            <Pencil className="size-3.5" />
          </Button>
        </>
      ) : (
        // Pagar R$ 0,00 é recusado pela action — a saída é corrigir o valor.
        <Button size="sm" variant="outline" onClick={() => onEditar(p)}>
          <Pencil className="size-3.5" /> Corrigir valor
        </Button>
      )}
      <CancelarPagamentoButton pagamento={p} onCancelado={onCancelado} />
    </div>
  );
}

/**
 * Conciliado deixou de ser bloqueio (G1a): a correção existe, só tem de bater com o
 * extrato — quem barra é `erroCorrecaoConciliada`, dentro do dialog e da action. Os
 * bloqueios que sobram (sem lançamento, baixa parcial) são raros: o botão fica e o clique
 * diz o motivo, em vez de abrir um dialog fadado a falhar.
 */
function CorrigirPagamentoButton({ p, onCorrigir }: { p: FolhaItem; onCorrigir: (p: FolhaItem) => void }) {
  const l = p.lancamento;
  const motivo = erroCorrecaoEfetivado(p.status, l && { status: l.status, conciliado: l.conciliado, parcial: l.parcial });
  return (
    <Button size="sm" variant="ghost" onClick={() => (motivo ? toast.info(motivo) : onCorrigir(p))}>
      <Pencil className="size-3.5" /> Corrigir pagamento
    </Button>
  );
}

/**
 * Estorno (G1b) — ícone, ao lado de "Corrigir pagamento", porque é a ação rara e mais
 * grave das duas. Conciliado não estorna: o clique explica em vez de abrir o dialog.
 */
function EstornarPagamentoButton({ p, onEstornar }: { p: FolhaItem; onEstornar: (p: FolhaItem) => void }) {
  const l = p.lancamento;
  const motivo = erroEstornoEfetivado(p.status, l && { status: l.status, conciliado: l.conciliado, parcial: l.parcial });
  return (
    <Button
      size="sm"
      variant="ghost"
      className="px-2 text-destructive"
      title="Estornar pagamento"
      aria-label="Estornar pagamento"
      onClick={() => (motivo ? toast.info(motivo) : onEstornar(p))}
    >
      <Undo2 className="size-3.5" />
    </Button>
  );
}

/**
 * Gera o recibo desta entrega paga (G5/D36) e avisa o projetista para assinar. Recibo nasce
 * depois do pagamento e não trava nada — por isso é um botão discreto, não um passo do fluxo.
 * A action recusa duplicata ("esta entrega já tem recibo individual").
 */
function ReciboIndividualButton({ p }: { p: FolhaItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function gerar() {
    start(async () => {
      const r = await gerarReciboIndividual({ pagamentoId: p.id });
      if (r.ok) {
        toast.success("Recibo gerado — o projetista foi avisado para assinar.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="px-2"
      title="Gerar recibo desta entrega"
      aria-label={`Gerar recibo do pagamento de ${p.projetista.name}`}
      onClick={gerar}
      disabled={pending}
    >
      <FileText className="size-3.5" />
    </Button>
  );
}

export function Kpi({ rotulo, valor, className }: { rotulo: string; valor: number; className: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{rotulo}</CardDescription>
        <CardTitle className={cn("text-2xl", className)}>{brl(valor)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/**
 * Filtros + os 3 cards de KPI + a legenda de que eles ignoram o status — igual nos dois
 * modos de leitura (por pagamento e por projetista), então mora num só lugar.
 */
export function FolhaResumoFiltros({
  filtros,
  opcoesFiltro,
  resumo,
  canceladosOcultos,
  filtrado,
}: {
  filtros: FiltrosFolha;
  opcoesFiltro: { projetistas: { id: string; name: string }[]; projetos: { id: string; codigo: string; nome: string }[] };
  resumo: { pendente: number; pago: number; cancelado: number };
  canceladosOcultos: number;
  filtrado: boolean;
}) {
  return (
    <div className="space-y-4">
      <FolhaFiltros
        filtros={filtros}
        projetistas={opcoesFiltro.projetistas}
        projetos={opcoesFiltro.projetos}
        canceladosOcultos={canceladosOcultos}
      />
      <div className="space-y-1.5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi rotulo="A pagar" valor={resumo.pendente} className="text-warning" />
          <Kpi rotulo="Pago" valor={resumo.pago} className="text-success" />
          <Kpi rotulo="Cancelado" valor={resumo.cancelado} className="text-muted-foreground" />
        </div>
        {/* Os totais ignoram o filtro de status de propósito — ver `listarFolha`. */}
        <p className="text-xs text-muted-foreground">
          {filtrado ? "Totais do filtro aplicado" : "Totais gerais"}, somando todos os status — mesmo os que a lista não está mostrando.
        </p>
      </div>
    </div>
  );
}

/**
 * D24: de onde saiu o dinheiro. Pago → data, conta e forma do lançamento, com link para
 * ele no livro caixa. Pendente → se já existe lançamento previsto (linhas zeradas não têm).
 */
export function CelulaPagamento({ p, linkLancamento }: { p: FolhaItem; linkLancamento: boolean }) {
  const l = p.lancamento;
  if (p.status === "pago") {
    return (
      <div className="text-xs">
        <span className="text-sm">{formatarData(p.pagoEm)}</span>
        {!l ? (
          <span className="block text-warning">sem lançamento</span>
        ) : (
          <>
            <span className={cn("block", l.conta ? "text-muted-foreground" : "text-warning")}>
              {l.conta ?? "sem conta bancária"}
              {l.forma ? ` · ${l.forma}` : ""}
            </span>
            {/* F8/D26: visibilidade do comprovante — "o ideal é que todo pagamento tenha o
                comprovante anexado" só é verificável se a tela mostrar quem não tem. */}
            <span className={cn("flex items-center gap-1", l.qtdAnexos > 0 ? "text-muted-foreground" : "text-warning")}>
              <Paperclip className="size-3" aria-hidden />
              {/* "anexo", não "comprovante": a contagem é de LancamentoAnexo (genérico) —
                  um anexado direto em Lançamentos pode não ser um comprovante de pagamento. */}
              {l.qtdAnexos > 0 ? `${l.qtdAnexos} anexo${l.qtdAnexos > 1 ? "s" : ""}` : "sem anexo"}
            </span>
            {linkLancamento && (
              <Link href={`/financeiro/lancamentos?lancamento=${l.id}`} className={cn("text-foreground", linkCls)}>
                ver lançamento
              </Link>
            )}
          </>
        )}
      </div>
    );
  }
  if (p.status === "pendente") {
    const previsto = l && l.status !== "cancelado";
    return (
      <span className="text-xs text-muted-foreground">
        {previsto ? "lançamento previsto" : "sem lançamento previsto"}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

/**
 * Botão de cancelar direto na folha — confirmação via `useConfirm` (padrão do repo,
 * evita mais um dialog controlado). Só aparece em pendentes; a action recusa o resto.
 */
export function CancelarPagamentoButton({
  pagamento,
  onCancelado,
}: {
  pagamento: FolhaItem;
  /** G9: dentro do lote expandido, `router.refresh()` sozinho não atualiza `itens`
   * (estado próprio do painel) — sem isso a linha cancelada fica presa na tabela. */
  onCancelado?: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  function cancelar() {
    start(async () => {
      const ok = await confirm({
        title: "Cancelar pagamento",
        description: `${pagamento.projetista.name} — ${brl(Number(pagamento.valor))}. A linha sai do "a pagar" e não pode ser desfeita por aqui.`,
        confirmLabel: "Cancelar pagamento",
        variant: "destructive",
      });
      if (!ok) return;
      const r = await cancelarPagamentoProjetista({ id: pagamento.id });
      if (r.ok) {
        toast.success("Pagamento cancelado.");
        onCancelado?.();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="px-2 text-destructive"
      title="Cancelar pagamento"
      aria-label="Cancelar pagamento"
      onClick={cancelar}
      disabled={pending}
    >
      <Ban className="size-3.5" />
    </Button>
  );
}

/**
 * Corrige o valor (e a observação) de um pagamento pendente — a rota de conserto para as
 * linhas de R$ 0,00 que já existem em produção. Zerar não é permitido aqui — use "Cancelar".
 */
export function EditarValorDialog({ pagamento, onClose }: { pagamento: FolhaItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const fe = useFieldErrors({ valor: "valor-pagamento", observacao: "observacao-pagamento" });

  // Aberto imperativamente (botão na linha, não um DialogTrigger interno) — `onOpenChange`
  // só dispara ao FECHAR, então os campos precisam ser sincronizados aqui.
  useEffect(() => {
    if (pagamento) {
      setValor(Number(pagamento.valor));
      setObservacao(pagamento.observacao ?? "");
      fe.limpar();
    }
    // `fe` muda a cada render; só a troca de pagamento importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento]);

  function salvar() {
    if (!pagamento) return;
    const num = valor ?? 0;
    if (!(num > 0)) {
      fe.definir("valor", "Informe um valor maior que zero.");
      return;
    }
    start(async () => {
      const r = await editarPagamentoProjetista({ id: pagamento.id, valor: num, observacao });
      if (r.ok) {
        toast.success("Pagamento atualizado.");
        onClose();
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  const campoValor = fe.campo("valor");
  const campoObs = fe.campo("observacao");

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
          <DialogDescription>{pagamento?.projetista.name} — {pagamento?.disciplina.disciplinaTextoLegado}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={campoValor.id}>Valor (R$)</Label>
            <InputMoeda
              {...campoValor}
              value={valor}
              onChange={(v) => {
                setValor(v);
                fe.limpar("valor");
              }}
              autoFocus
            />
            <FieldError campo={campoValor.id} mensagem={fe.erros.valor} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={campoObs.id}>Observação</Label>
            <Input
              {...campoObs}
              value={observacao}
              maxLength={500}
              onChange={(e) => {
                setObservacao(e.target.value);
                fe.limpar("observacao");
              }}
            />
            <FieldError campo={campoObs.id} mensagem={fe.erros.observacao} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pagamento individual — o mesmo dialog de efetivação dos caminhos em lote (F5). */
export function PagarDialog({
  pagamento,
  onClose,
  contas,
  formas,
}: {
  pagamento: FolhaItem | null;
  onClose: () => void;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  // Depois de efetivar (F8/D26), o dialog não fecha — oferece anexar o comprovante antes.
  // `pagamento` continua truthy nas duas fases; só o CONTEÚDO troca (ver o `return` abaixo).
  const [lancamentoId, setLancamentoId] = useState<string | null>(null);

  async function efetivar(d: DadosEfetivacao) {
    if (!pagamento) return { ok: false as const, error: "Pagamento não encontrado." };
    const r = await pagarProjetista({ id: pagamento.id, ...d });
    if (r.ok) {
      toast.success("Pagamento efetivado — lançamento criado no caixa.");
      setLancamentoId(r.data.lancamentoId);
      router.refresh();
    }
    return r;
  }

  function concluir() {
    setLancamentoId(null);
    onClose();
  }

  if (lancamentoId) {
    return <AnexarComprovanteDialog lancamentoId={lancamentoId} onConcluir={concluir} />;
  }

  return (
    <EfetivarPagamentoDialog
      open={!!pagamento}
      titulo="Efetivar pagamento"
      descricao={pagamento ? `${pagamento.projetista.name} — ${brl(Number(pagamento.valor))}` : ""}
      contas={contas}
      formas={formas}
      confirmarLabel="Efetivar pagamento"
      onConfirmar={efetivar}
      onClose={onClose}
    />
  );
}
