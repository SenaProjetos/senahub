"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Plus, GripVertical } from "lucide-react";
import { moverLead } from "@/modules/comercial/actions";
import type { EtapaFunil, LeadItem } from "@/modules/comercial/queries";
import { LeadDialog } from "./lead-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function FunilBoard({ etapas }: { etapas: EtapaFunil[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<LeadItem | null>(null);
  const [dialogLead, setDialogLead] = useState<LeadItem | null | "novo">(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    const lead = etapas.flatMap((et) => et.leads).find((l) => l.id === e.active.id);
    setArrastando(lead ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const leadId = String(e.active.id);
    const etapaId = e.over ? String(e.over.id) : null;
    if (!etapaId) return;
    const origem = etapas.find((et) => et.leads.some((l) => l.id === leadId));
    if (!origem || origem.id === etapaId) return;
    start(async () => {
      const r = await moverLead({ id: leadId, etapaId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-tight">Funil de vendas</h3>
        <Button size="sm" onClick={() => setDialogLead("novo")}>
          <Plus className="size-4" /> Novo lead
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {etapas.map((etapa) => (
            <Coluna key={etapa.id} etapa={etapa} onAbrir={(l) => setDialogLead(l)} />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? <CardLead lead={arrastando} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <LeadDialog
        lead={dialogLead === "novo" ? null : dialogLead}
        open={dialogLead !== null}
        onOpenChange={(o) => !o && setDialogLead(null)}
        etapas={etapas.map((e) => ({ id: e.id, nome: e.nome }))}
      />
    </>
  );
}

function Coluna({ etapa, onAbrir }: { etapa: EtapaFunil; onAbrir: (l: LeadItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const total = etapa.leads.reduce((s, l) => s + Number(l.valorEstimado ?? 0), 0);

  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: etapa.cor ?? "#576980" }} />
        <span className="text-sm font-semibold">{etapa.nome}</span>
        <Badge variant="outline" className="ml-auto">
          {etapa.leads.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-40 space-y-2 rounded-sm border p-2 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-dashed"
        }`}
      >
        {etapa.leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} onAbrir={onAbrir} />
        ))}
        {etapa.leads.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">vazio</p>
        )}
      </div>
      {total > 0 && (
        <p className="mt-1 text-right font-mono text-xs text-muted-foreground">{brl(total)}</p>
      )}
    </div>
  );
}

function DraggableCard({ lead, onAbrir }: { lead: LeadItem; onAbrir: (l: LeadItem) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <CardLead lead={lead} onAbrir={onAbrir} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function CardLead({
  lead,
  onAbrir,
  dragProps,
  overlay,
}: {
  lead: LeadItem;
  onAbrir?: (l: LeadItem) => void;
  dragProps?: Record<string, unknown>;
  overlay?: boolean;
}) {
  return (
    <div
      className={`rounded-sm border bg-card p-2.5 text-sm shadow-sm ${overlay ? "rotate-2" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground"
          aria-label="Arrastar"
          {...dragProps}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onAbrir?.(lead)}
        >
          <p className="truncate font-medium">{lead.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.cliente ? `Cliente: ${lead.cliente.nome}` : (lead.origem ?? "—")}
          </p>
          <div className="mt-1 flex items-center gap-2">
            {lead.valorEstimado != null && (
              <span className="font-mono text-xs">{brl(Number(lead.valorEstimado))}</span>
            )}
            {lead._count.propostas > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {lead._count.propostas} proposta(s)
              </Badge>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
