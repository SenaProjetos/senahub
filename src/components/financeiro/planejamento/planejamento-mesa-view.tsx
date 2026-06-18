"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  ArrowLeft, GripVertical, Plus, Save, Trash2, Check, Send, ShieldCheck, Play, Ban, X,
} from "lucide-react";
import {
  salvarLinhas, atualizarPlano, adicionarLinhas, removerLinha, mudarStatusPlano, executarPlano,
} from "@/modules/financeiro/planejamento/actions";
import { calcularPlano } from "@/modules/financeiro/planejamento/recalculo";
import type { PlanoDetalhe, PlanoLinhaDetalhe, LancamentoPlano } from "@/modules/financeiro/planejamento/queries";
import { STATUS_META, type StatusPlano } from "./status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dt(d: string | null) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

const COLS = "28px 28px minmax(150px,1fr) 96px 120px 130px 130px 96px 32px";

type LinhaLocal = {
  id: string;
  lancamentoId: string;
  valorPlanejado: number;
  selecionada: boolean;
  lancamento: PlanoLinhaDetalhe["lancamento"];
};

export function PlanejamentoMesaView({ plano, disponiveis }: { plano: PlanoDetalhe; disponiveis: LancamentoPlano[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const readOnly = plano.status === "executado" || plano.status === "cancelado";

  const [nome, setNome] = useState(plano.nome);
  const [saldo, setSaldo] = useState(String(plano.saldoDisponivel));
  const [obs, setObs] = useState(plano.observacoes ?? "");
  const [linhas, setLinhas] = useState<LinhaLocal[]>(
    plano.linhas.map((l) => ({
      id: l.id,
      lancamentoId: l.lancamentoId,
      valorPlanejado: l.valorPlanejado,
      selecionada: l.selecionada,
      lancamento: l.lancamento,
    })),
  );
  const [addOpen, setAddOpen] = useState(false);

  const saldoNum = Number(saldo) || 0;
  const { linhas: calc, indicadores } = useMemo(
    () => calcularPlano(saldoNum, linhas.map((l) => ({ selecionada: l.selecionada, valorPlanejado: l.valorPlanejado }))),
    [linhas, saldoNum],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLinhas((prev) => {
      const from = prev.findIndex((l) => l.id === active.id);
      const to = prev.findIndex((l) => l.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function setValor(id: string, v: string) {
    const n = Math.max(0, Number(v) || 0);
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, valorPlanejado: n } : l)));
  }
  function toggleSel(id: string) {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, selecionada: !l.selecionada } : l)));
  }
  function remover(id: string) {
    start(async () => {
      const r = await removerLinha({ id, planoId: plano.id });
      if (r.ok) {
        setLinhas((prev) => prev.filter((l) => l.id !== id));
        toast.success("Linha removida.");
      } else toast.error(r.error);
    });
  }

  function salvar() {
    start(async () => {
      const a = await atualizarPlano({ id: plano.id, nome, saldoDisponivel: saldoNum, observacoes: obs });
      if (!a.ok) {
        toast.error(a.error);
        return;
      }
      const b = await salvarLinhas({
        id: plano.id,
        linhas: linhas.map((l, i) => ({ id: l.id, ordem: i, valorPlanejado: l.valorPlanejado, selecionada: l.selecionada })),
      });
      if (b.ok) {
        toast.success("Plano salvo.");
        router.refresh();
      } else toast.error(b.error);
    });
  }

  function mudarStatus(status: "rascunho" | "analise" | "aprovado" | "cancelado") {
    start(async () => {
      const r = await mudarStatusPlano({ id: plano.id, status });
      if (r.ok) {
        toast.success("Status atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function executar() {
    if (!confirm("Executar o plano? As linhas selecionadas serão pagas pelo valor planejado; saldos restantes ficam em aberto.")) return;
    start(async () => {
      const r = await executarPlano({ id: plano.id });
      if (r.ok) {
        toast.success(`Plano executado: ${r.data.pagos} pagamento(s).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const meta = STATUS_META[plano.status as StatusPlano];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/financeiro/planejamento" aria-label="Voltar" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">{plano.nome}</h2>
            <p className="text-xs text-muted-foreground">Responsável: {plano.responsavel}</p>
          </div>
          <Badge variant="outline" className={meta.classe}>{meta.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} disabled={disponiveis.length === 0}>
                <Plus className="size-4" /> Adicionar contas
              </Button>
              <Button size="sm" onClick={salvar} disabled={pending}><Save className="size-4" /> Salvar</Button>
            </>
          )}
          {plano.status === "rascunho" && <Button variant="outline" size="sm" onClick={() => mudarStatus("analise")}><Send className="size-4" /> Enviar p/ análise</Button>}
          {plano.status === "analise" && (
            <>
              <Button variant="outline" size="sm" onClick={() => mudarStatus("rascunho")}>Voltar a rascunho</Button>
              <Button size="sm" onClick={() => mudarStatus("aprovado")}><ShieldCheck className="size-4" /> Aprovar</Button>
            </>
          )}
          {plano.status === "aprovado" && (
            <>
              <Button variant="outline" size="sm" onClick={() => mudarStatus("analise")}>Reabrir</Button>
              <Button size="sm" onClick={executar} disabled={pending}><Play className="size-4" /> Executar</Button>
            </>
          )}
          {!readOnly && <Button variant="ghost" size="sm" onClick={() => mudarStatus("cancelado")}><Ban className="size-4" /> Cancelar</Button>}
        </div>
      </div>

      {/* Configuração + indicadores */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do cenário</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Saldo disponível (R$)</Label>
              <Input type="number" value={saldo} onChange={(e) => setSaldo(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} disabled={readOnly} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            <Indic rotulo="Saldo inicial" valor={brl(indicadores.saldoInicial)} />
            <Indic rotulo="Total planejado" valor={brl(indicadores.totalPlanejado)} />
            <Indic rotulo="Saldo remanescente" valor={brl(indicadores.saldoRemanescente)} cor={indicadores.saldoRemanescente < 0 ? "text-destructive" : "text-success"} />
            <div className="flex justify-between border-t pt-1">
              <span>Contempladas</span>
              <span className="font-mono"><span className="text-success">{indicadores.contempladas}</span> / não: <span className="text-destructive">{indicadores.naoContempladas}</span></span>
            </div>
            <Indic rotulo="Cobertura" valor={`${indicadores.percentualCobertura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} />
          </CardContent>
        </Card>
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="grid items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground" style={{ gridTemplateColumns: COLS }}>
            <span /><span />
            <span>Favorecido</span>
            <span>Vencimento</span>
            <span className="text-right">Valor original</span>
            <span className="text-right">Valor planejado</span>
            <span className="text-right">Saldo acumulado</span>
            <span>Status</span>
            <span />
          </div>

          {linhas.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma conta no plano. Use “Adicionar contas”.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={linhas.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {linhas.map((l, i) => (
                  <LinhaPlano
                    key={l.id}
                    linha={l}
                    calc={calc[i]}
                    readOnly={readOnly}
                    onValor={setValor}
                    onToggle={toggleSel}
                    onRemover={remover}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <AdicionarDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        planoId={plano.id}
        disponiveis={disponiveis}
        onDone={() => { setAddOpen(false); router.refresh(); }}
      />
    </div>
  );
}

function Indic({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={`font-mono ${cor ?? ""}`}>{valor}</span>
    </div>
  );
}

function LinhaPlano({
  linha, calc, readOnly, onValor, onToggle, onRemover,
}: {
  linha: LinhaLocal;
  calc: { saldoAcumulado: number; contemplada: boolean };
  readOnly: boolean;
  onValor: (id: string, v: string) => void;
  onToggle: (id: string) => void;
  onRemover: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: linha.id });
  const style: CSSProperties = {
    gridTemplateColumns: COLS,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const lc = linha.lancamento;
  return (
    <div ref={setNodeRef} style={style} className={`grid items-center gap-2 border-b px-3 py-2 text-sm last:border-0 ${linha.selecionada ? "" : "opacity-50"}`}>
      <button type="button" className="cursor-grab text-muted-foreground disabled:cursor-default" {...attributes} {...listeners} disabled={readOnly} aria-label="Reordenar">
        <GripVertical className="size-4" />
      </button>
      <input type="checkbox" checked={linha.selecionada} onChange={() => onToggle(linha.id)} disabled={readOnly} className="size-3.5" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{lc.favorecido ?? lc.descricao}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {lc.categoria ?? "—"}
          {lc.projeto && ` · ${formatarCodigo(lc.projeto.codigo)}`}
        </span>
      </span>
      <span className="font-mono text-xs">{dt(lc.vencimento)}</span>
      <span className="text-right font-mono text-xs text-muted-foreground">{brl(lc.valor)}</span>
      <span className="text-right">
        <Input
          type="number"
          value={linha.valorPlanejado}
          onChange={(e) => onValor(linha.id, e.target.value)}
          disabled={readOnly || !linha.selecionada}
          className="h-7 text-right font-mono text-xs"
        />
      </span>
      <span className={`text-right font-mono text-xs ${calc.saldoAcumulado < 0 ? "text-destructive" : ""}`}>{brl(calc.saldoAcumulado)}</span>
      <span>
        {linha.selecionada && (
          <Badge variant="outline" className={calc.contemplada ? "text-success border-success/40" : "text-destructive border-destructive/40"}>
            {calc.contemplada ? <Check className="size-3" /> : <X className="size-3" />}
            {calc.contemplada ? "OK" : "Sem saldo"}
          </Badge>
        )}
      </span>
      <span className="text-right">
        {!readOnly && (
          <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => onRemover(linha.id)} className="size-7">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </span>
    </div>
  );
}

function AdicionarDialog({
  open, onClose, planoId, disponiveis, onDone,
}: {
  open: boolean; onClose: () => void; planoId: string; disponiveis: LancamentoPlano[]; onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function adicionar() {
    if (sel.size === 0) return;
    start(async () => {
      const r = await adicionarLinhas({ id: planoId, lancamentoIds: [...sel] });
      if (r.ok) {
        toast.success(`${r.data.adicionadas} conta(s) adicionada(s).`);
        setSel(new Set());
        onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar contas em aberto</DialogTitle>
        </DialogHeader>
        {disponiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta em aberto fora do plano.</p>
        ) : (
          <ul className="divide-y rounded-sm border text-sm">
            {disponiveis.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {c.favorecido ?? c.descricao}
                  <span className="block truncate text-xs text-muted-foreground">{c.categoria ?? "—"}</span>
                </span>
                <span className="font-mono text-xs">{brl(c.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={adicionar} disabled={pending || sel.size === 0}>{pending ? "Adicionando…" : `Adicionar ${sel.size || ""}`.trim()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
