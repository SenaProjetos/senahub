"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { salvarRateioLancamento } from "@/modules/financeiro/lancamentos/actions";
import { validarRateio, type ItemRateio } from "@/modules/financeiro/lancamentos/rateio";
import type { LancamentoItem, OpcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { Button } from "@/components/ui/button";
import { InputPercentual } from "@/components/ui/input-percentual";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarCodigo } from "@/modules/projetos/numbering";

const NONE = "__none";

type Linha = { centroId: string; projetoId: string; percentual: number | null };

function linhasIniciais(l: LancamentoItem): Linha[] {
  if (l.rateios.length > 0) {
    return l.rateios.map((r) => ({ centroId: r.centroId ?? NONE, projetoId: r.projetoId ?? NONE, percentual: r.percentualBp / 100 }));
  }
  // Sem rateio ainda: começa com 2 linhas em branco (rateio precisa de pelo menos 2).
  return [
    { centroId: l.centroId ?? NONE, projetoId: l.projetoId ?? NONE, percentual: null },
    { centroId: NONE, projetoId: NONE, percentual: null },
  ];
}

/**
 * Rateio de um lançamento entre centros/projetos (M10). SÓ muda o Relatório por dimensão — o
 * centro/projeto do lançamento continua sendo o "principal" em todo o resto (livro caixa, aging, EVM).
 */
export function RateioDialog({
  lancamento,
  opcoes,
  onClose,
}: {
  lancamento: LancamentoItem | null;
  opcoes: Pick<OpcoesLancamento, "centros" | "projetos">;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  if (lancamento && lancamento.id !== alvoId) {
    setAlvoId(lancamento.id);
    setLinhas(linhasIniciais(lancamento));
  }

  function set(i: number, patch: Partial<Linha>) {
    setLinhas((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function adicionar() {
    setLinhas((p) => [...p, { centroId: NONE, projetoId: NONE, percentual: null }]);
  }
  function remover(i: number) {
    setLinhas((p) => p.filter((_, idx) => idx !== i));
  }

  const total = linhas.reduce((s, l) => s + (l.percentual ?? 0), 0);
  const itens: ItemRateio[] = linhas.map((l) => ({
    centroId: l.centroId === NONE ? null : l.centroId,
    projetoId: l.projetoId === NONE ? null : l.projetoId,
    percentualBp: Math.round((l.percentual ?? 0) * 100),
  }));
  const erro = linhas.some((l) => l.percentual == null) ? null : validarRateio(itens);

  function salvar() {
    if (!lancamento) return;
    if (linhas.some((l) => l.percentual == null)) {
      toast.error("Informe o percentual de cada linha.");
      return;
    }
    if (erro) {
      toast.error(erro);
      return;
    }
    start(async () => {
      const r = await salvarRateioLancamento({ id: lancamento.id, itens });
      if (r.ok) {
        toast.success("Rateio salvo.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function removerRateio() {
    if (!lancamento) return;
    start(async () => {
      const r = await salvarRateioLancamento({ id: lancamento.id, itens: [] });
      if (r.ok) {
        toast.success("Rateio removido: voltou ao centro/projeto únicos.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ratear entre centros e projetos</DialogTitle>
          <DialogDescription>
            Divide {lancamento?.descricao} entre centros de custo e/ou projetos, por percentual. Só muda o Relatório
            por dimensão — o centro/projeto do lançamento continua valendo para o resto do sistema.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-sm border px-3 py-2">
              <div className="min-w-32 flex-1 space-y-1">
                <Label className="text-xs">Centro de custo</Label>
                <Select value={l.centroId} onValueChange={(v) => set(i, { centroId: v ?? NONE })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— nenhum —</SelectItem>
                    {opcoes.centros.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-32 flex-1 space-y-1">
                <Label className="text-xs">Projeto</Label>
                <Select value={l.projetoId} onValueChange={(v) => set(i, { projetoId: v ?? NONE })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— nenhum —</SelectItem>
                    {opcoes.projetos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {formatarCodigo(p.codigo)} · {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">%</Label>
                <InputPercentual value={l.percentual} onChange={(v) => set(i, { percentual: v })} decimais={2} className="h-8" />
              </div>
              <Button variant="ghost" size="icon" aria-label="Remover linha" onClick={() => remover(i)} disabled={linhas.length <= 2}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={adicionar}>
              <Plus className="size-4" /> Adicionar linha
            </Button>
            <span className={`text-sm font-mono ${Math.round(total * 100) === 10000 ? "text-success" : "text-destructive"}`}>
              {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}% de 100%
            </span>
          </div>
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </DialogBody>
        <DialogFooter className="justify-between">
          {lancamento && lancamento.rateios.length > 0 ? (
            <Button variant="ghost" onClick={removerRateio} disabled={pending}>
              Remover rateio
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar rateio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
