"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, GripVertical, Lock, CalendarDays } from "lucide-react";
import { moverTarefa } from "@/modules/tarefas/actions";
import { TarefaDialog, type TarefaUI, type OpcoesUI } from "./tarefa-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Coluna = {
  id: string;
  nome: string;
  cor: string | null;
  concluido: boolean;
  tarefas: TarefaUI[];
};

export function TarefasBoard({ colunas, opcoes }: { colunas: Coluna[]; opcoes: OpcoesUI }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<TarefaUI | null>(null);
  const [dialog, setDialog] = useState<TarefaUI | null | "nova">(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    setArrastando(colunas.flatMap((c) => c.tarefas).find((t) => t.id === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const tarefaId = String(e.active.id);
    const statusId = e.over ? String(e.over.id) : null;
    if (!statusId) return;
    const origem = colunas.find((c) => c.tarefas.some((t) => t.id === tarefaId));
    if (!origem || origem.id === statusId) return;
    start(async () => {
      const r = await moverTarefa({ id: tarefaId, statusId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Tarefas</h2>
          <p className="text-sm text-muted-foreground">
            Kanban com dependências — tarefas bloqueadas só concluem após as dependências.
          </p>
        </div>
        <Button onClick={() => setDialog("nova")}>
          <Plus className="size-4" /> Nova tarefa
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {colunas.map((col) => (
            <ColunaView key={col.id} col={col} onAbrir={(t) => setDialog(t)} />
          ))}
        </div>
        <DragOverlay>{arrastando ? <CardTarefa t={arrastando} overlay /> : null}</DragOverlay>
      </DndContext>

      <TarefaDialog
        tarefa={dialog === "nova" ? null : dialog}
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        opcoes={opcoes}
        colunas={colunas.map((c) => ({ id: c.id, nome: c.nome }))}
      />
    </div>
  );
}

function ColunaView({ col, onAbrir }: { col: Coluna; onAbrir: (t: TarefaUI) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div className="w-72 shrink-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: col.cor ?? "#576980" }} />
        <span className="text-sm font-semibold">{col.nome}</span>
        <Badge variant="outline" className="ml-auto">
          {col.tarefas.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-40 space-y-2 rounded-sm border p-2 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-dashed"
        }`}
      >
        {col.tarefas.map((t) => (
          <DraggableTarefa key={t.id} t={t} onAbrir={onAbrir} />
        ))}
        {col.tarefas.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">vazio</p>
        )}
      </div>
    </div>
  );
}

function DraggableTarefa({ t, onAbrir }: { t: TarefaUI; onAbrir: (t: TarefaUI) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <CardTarefa t={t} onAbrir={onAbrir} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function CardTarefa({
  t,
  onAbrir,
  dragProps,
  overlay,
}: {
  t: TarefaUI;
  onAbrir?: (t: TarefaUI) => void;
  dragProps?: Record<string, unknown>;
  overlay?: boolean;
}) {
  const feitos = t.itens.filter((i) => i.concluido).length;
  const atrasada = t.prazo && new Date(t.prazo) < new Date(new Date().toDateString());
  return (
    <div className={`rounded-sm border bg-card p-2.5 text-sm shadow-sm ${overlay ? "rotate-2" : ""}`}>
      <div className="flex items-start gap-1.5">
        <button type="button" className="mt-0.5 cursor-grab text-muted-foreground" aria-label="Arrastar" {...dragProps}>
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onAbrir?.(t)}>
          <p className="flex items-center gap-1.5 font-medium">
            {t.bloqueada && <Lock className="size-3.5 text-warning" />}
            <span className="truncate">{t.titulo}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t.projetoCodigo && <span className="font-mono">{formatarCodigo(t.projetoCodigo)}</span>}
            {t.prazo && (
              <span className={`flex items-center gap-1 ${atrasada ? "text-destructive" : ""}`}>
                <CalendarDays className="size-3" />
                {new Date(t.prazo + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
            )}
            {t.itens.length > 0 && (
              <span>
                ☑ {feitos}/{t.itens.length}
              </span>
            )}
          </div>
          {t.responsaveis.length > 0 && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {t.responsaveis.map((r) => r.nome).join(", ")}
            </p>
          )}
        </button>
      </div>
    </div>
  );
}
