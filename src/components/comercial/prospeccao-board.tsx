"use client";

import { useMemo, useState, useTransition } from "react";
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
import { GripVertical, CalendarClock } from "lucide-react";
import type { StatusProspeccao } from "@/generated/prisma/client";
import { moverProspeccao } from "@/modules/comercial/actions";
import type { ColunaProspeccao, LeadProspeccao } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import {
  TEMPERATURA_CLASS,
  TEMPERATURA_ICONE,
  TEMPERATURA_LABEL,
  ehTemperatura,
} from "@/modules/comercial/temperatura";
import { diasSemInteracao, followUpAtrasado } from "@/modules/comercial/frescor";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { brlInteiro } from "@/lib/utils";

/**
 * Kanban de Prospecção (F2.13) — agrupado por `status`, não por `FunilEtapa` (deprecado na F2.3).
 *
 * **Movimento otimista com rollback.** O card muda de coluna na hora, e só volta se o servidor
 * recusar. É a diferença que o aceite pede: o board antigo esperava a resposta e chamava
 * `router.refresh()`, então arrastar com a rede ruim dava a impressão de que nada aconteceu.
 *
 * O estado local (`movidos`) guarda só os cards MOVIDOS desde o último carregamento, sobrepondo o
 * status vindo do servidor. Assim o `router.refresh()` de sucesso reconcilia sozinho, e um erro
 * simplesmente remove a sobreposição — o card volta para onde estava, sem precisar guardar cópia
 * do board inteiro.
 */
export function ProspeccaoBoard({ colunas }: { colunas: ColunaProspeccao[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<LeadProspeccao | null>(null);
  /** leadId → status otimista. Sobrepõe o que veio do servidor até a próxima leitura. */
  const [movidos, setMovidos] = useState<Record<string, StatusProspeccao>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const agora = useMemo(() => new Date(), []);

  const colunasExibidas = useMemo(() => {
    const todos = colunas.flatMap((c) => c.leads);
    return colunas.map((c) => ({
      ...c,
      leads: todos.filter((l) => (movidos[l.id] ?? l.status) === c.status),
    }));
  }, [colunas, movidos]);

  function onDragStart(e: DragStartEvent) {
    const lead = colunas.flatMap((c) => c.leads).find((l) => l.id === e.active.id);
    setArrastando(lead ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const leadId = String(e.active.id);
    const destino = e.over ? (String(e.over.id) as StatusProspeccao) : null;
    if (!destino) return;

    const lead = colunas.flatMap((c) => c.leads).find((l) => l.id === leadId);
    if (!lead) return;
    const atual = movidos[leadId] ?? lead.status;
    if (atual === destino) return;

    // Otimista: move já.
    setMovidos((m) => ({ ...m, [leadId]: destino }));

    start(async () => {
      const r = await moverProspeccao({ leadId, para: destino });
      if (r.ok) {
        if (r.data?.qualificada) toast.success("Prospecção qualificada — negociação criada.");
        router.refresh();
      } else {
        // Rollback: tira a sobreposição e o card volta sozinho para a coluna de origem.
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[leadId];
          return resto;
        });
        toast.error(r.error);
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunasExibidas.map((c) => (
          <Coluna key={c.status} status={c.status} leads={c.leads} agora={agora} />
        ))}
      </div>
      <DragOverlay>
        {arrastando ? <Card lead={arrastando} agora={agora} arrastandoOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Coluna({
  status,
  leads,
  agora,
}: {
  status: StatusProspeccao;
  leads: LeadProspeccao[];
  agora: Date;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-sm border p-2 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border/60"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{STATUS_PROSPECCAO_LABEL[status]}</span>
        {/* Contador por coluna — o aceite exige que confira com a lista, então ele conta
            exatamente o array renderizado, nunca um total vindo separado do servidor. */}
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {leads.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {leads.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">—</p>
        ) : (
          leads.map((l) => <Card key={l.id} lead={l} agora={agora} />)
        )}
      </div>
    </div>
  );
}

function Card({
  lead,
  agora,
  arrastandoOverlay,
}: {
  lead: LeadProspeccao;
  agora: Date;
  arrastandoOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const dias = diasSemInteracao(new Date(lead.updatedAt), agora);
  const atrasado = lead.proximaAcao
    ? followUpAtrasado(new Date(lead.proximaAcao.inicio), agora)
    : false;

  return (
    <div
      ref={arrastandoOverlay ? undefined : setNodeRef}
      className={`rounded-sm border bg-card p-2 text-sm ${
        isDragging && !arrastandoOverlay ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        {!arrastandoOverlay && (
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground"
            aria-label={`Arrastar ${lead.nome}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{lead.cliente?.nome ?? lead.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.origemDetalhada ?? lead.nome}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {lead.valorEstimado != null && (
              <span className="font-mono text-xs">{brlInteiro(lead.valorEstimado)}</span>
            )}
            {ehTemperatura(lead.temperatura) && (
              <Badge
                variant="outline"
                className={`text-[10px] ${TEMPERATURA_CLASS[lead.temperatura]}`}
                title={`Temperatura: ${TEMPERATURA_LABEL[lead.temperatura]}`}
              >
                {TEMPERATURA_ICONE[lead.temperatura]} {TEMPERATURA_LABEL[lead.temperatura]}
              </Badge>
            )}
            {/* Dias parados: só aparece a partir de 3 dias, senão todo card teria a etiqueta e
                ela deixaria de chamar atenção justamente onde importa. */}
            {dias != null && dias >= 3 && (
              <span className="font-mono text-[10px] text-muted-foreground" title="Dias sem movimentação">
                {dias}d
              </span>
            )}
          </div>

          {lead.proximaAcao && (
            <p
              className={`mt-1 flex items-center gap-1 truncate text-[10px] ${
                atrasado ? "text-destructive" : "text-muted-foreground"
              }`}
              title={lead.proximaAcao.titulo}
            >
              <CalendarClock className="size-3 shrink-0" />
              {lead.proximaAcao.tipo ? TIPO_PROXIMA_ACAO_LABEL[lead.proximaAcao.tipo] : "Ação"}
              {atrasado ? " · atrasada" : ""}
            </p>
          )}
          {!lead.proximaAcao && (
            <p className="mt-1 text-[10px] text-warning" title="Sem próxima ação marcada">
              sem próxima ação
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProspeccaoVazia() {
  return (
    <EmptyState
      icon={CalendarClock}
      title="Nenhuma prospecção ativa"
      description="Crie um lead no funil para começar."
    />
  );
}
