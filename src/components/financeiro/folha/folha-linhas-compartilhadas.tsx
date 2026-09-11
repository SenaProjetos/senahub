"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Pencil, Ban } from "lucide-react";
import {
  pagarProjetista,
  editarPagamentoProjetista,
  cancelarPagamentoProjetista,
} from "@/modules/financeiro/folha/actions";
import { temValorPagavel } from "@/modules/financeiro/folha/service";
import { STATUS_PAGAMENTO_TONE, STATUS_PAGAMENTO_LABEL, type FiltrosFolha } from "@/modules/financeiro/folha/status";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, cn, formatarData } from "@/lib/utils";
import { FolhaFiltros } from "./folha-filtros";

export const NONE = "__none";
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

/** Botões de ação de uma linha pendente: Pagar/Corrigir valor + Editar + Cancelar. */
export function AcoesPagamento({
  p,
  onPagar,
  onEditar,
}: {
  p: FolhaItem;
  onPagar: (p: FolhaItem) => void;
  onEditar: (p: FolhaItem) => void;
}) {
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
      <CancelarPagamentoButton pagamento={p} />
    </div>
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
export function CancelarPagamentoButton({ pagamento }: { pagamento: FolhaItem }) {
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

  // Aberto imperativamente (botão na linha, não um DialogTrigger interno) — `onOpenChange`
  // só dispara ao FECHAR, então os campos precisam ser sincronizados aqui.
  useEffect(() => {
    if (pagamento) {
      setValor(Number(pagamento.valor));
      setObservacao(pagamento.observacao ?? "");
    }
  }, [pagamento]);

  function salvar() {
    if (!pagamento) return;
    const num = valor ?? 0;
    if (!(num > 0)) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    start(async () => {
      const r = await editarPagamentoProjetista({ id: pagamento.id, valor: num, observacao });
      if (r.ok) {
        toast.success("Pagamento atualizado.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
          <DialogDescription>{pagamento?.projetista.name} — {pagamento?.disciplina.disciplinaTextoLegado}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="valor-pagamento">Valor (R$)</Label>
            <InputMoeda id="valor-pagamento" value={valor} onChange={setValor} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacao-pagamento">Observação</Label>
            <Input
              id="observacao-pagamento"
              value={observacao}
              maxLength={500}
              onChange={(e) => setObservacao(e.target.value)}
            />
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
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hoje);

  function efetivar() {
    if (!pagamento) return;
    start(async () => {
      const r = await pagarProjetista({
        id: pagamento.id,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        data,
      });
      if (r.ok) {
        toast.success("Pagamento efetivado — lançamento criado no caixa.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Efetivar pagamento</DialogTitle>
          <DialogDescription>
            {pagamento?.projetista.name} — {brl(Number(pagamento?.valor ?? 0))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger>
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
                <SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>Data do pagamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={efetivar} disabled={pending}>
            {pending ? "Pagando…" : "Efetivar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
