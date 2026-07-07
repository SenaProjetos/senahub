"use client";

import { useState, useTransition } from "react";
import { CheckSquare, Square, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_CHIP } from "@/modules/projetos/status";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { editarDisciplinasEmMassa } from "@/modules/projetos/actions";
import type { StatusDisciplina } from "@/generated/prisma/client";

const STATUS_ORDER: StatusDisciplina[] = [
  "aguardando",
  "em_andamento",
  "em_revisao",
  "entregue",
  "aprovado",
];

const STATUS_COL_CLASS: Record<StatusDisciplina, string> = {
  aguardando: "border-t-muted-foreground/30",
  em_andamento: "border-t-status-andamento",
  em_revisao: "border-t-status-revisao",
  entregue: "border-t-status-entregue",
  aprovado: "border-t-status-aprovado",
};

export interface DisciplinaKanban {
  id: string;
  nome: string;
  status: StatusDisciplina;
  prazo: string | null;
  valor: number | null;
  responsaveis: { userId: string; name: string }[];
  ehResponsavel: boolean;
}

interface DisciplinasKanbanProps {
  projetoId: string;
  disciplinas: DisciplinaKanban[];
  podeGerir: boolean;
  internos?: { id: string; name: string }[];
}

function KanbanCard({
  disc,
  selected,
  onToggle,
  podeGerir,
}: {
  disc: DisciplinaKanban;
  selected: boolean;
  onToggle: () => void;
  podeGerir: boolean;
}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazoVencido =
    disc.prazo &&
    disc.status !== "aprovado" &&
    new Date(disc.prazo) < hoje;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      {podeGerir && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[selected]:opacity-100"
          data-selected={selected || undefined}
          aria-label={selected ? "Desmarcar" : "Selecionar"}
        >
          {selected ? (
            <CheckSquare className="size-4 text-primary" />
          ) : (
            <Square className="size-4 text-muted-foreground" />
          )}
        </button>
      )}

      <span className="pr-6 text-sm font-medium leading-snug">{disc.nome}</span>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium",
            STATUS_CHIP[disc.status],
          )}
        >
          {STATUS_LABEL[disc.status]}
        </span>

        {disc.prazo && (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5",
              prazoVencido
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "text-muted-foreground",
            )}
          >
            {formatarData(new Date(disc.prazo))}
          </span>
        )}
      </div>

      {disc.responsaveis.length > 0 && (
        <p className="truncate text-[11px] text-muted-foreground">
          {disc.responsaveis.map((r) => r.name.split(" ")[0]).join(", ")}
        </p>
      )}
    </div>
  );
}

export function DisciplinasKanban({
  projetoId,
  disciplinas,
  podeGerir,
  internos = [],
}: DisciplinasKanbanProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const applyMassAction = (params: {
    status?: StatusDisciplina;
    prazo?: string | null;
    responsavelId?: string | null;
  }) => {
    startTransition(async () => {
      const res = await editarDisciplinasEmMassa({
        projetoId,
        disciplinaIds: [...selected],
        ...params,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao atualizar disciplinas.");
      } else {
        toast.success(`${selected.size} disciplina(s) atualizada(s).`);
        clearSelection();
      }
    });
  };

  const colunas = STATUS_ORDER.map((status) => ({
    status,
    items: disciplinas.filter((d) => d.status === status),
  }));

  const anySelected = selected.size > 0;

  return (
    <div className="space-y-3">
      {/* Barra de ações em massa */}
      {anySelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>

          <Select<string>
            onValueChange={(v) => v && applyMassAction({ status: v as StatusDisciplina })}
          >
            <SelectTrigger className="h-8 w-auto min-w-[140px] text-sm">
              <SelectValue placeholder="Mudar status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {internos.length > 0 && (
            <Select<string>
              onValueChange={(v: string | null) =>
                applyMassAction({ responsavelId: v === "__nenhum" ? null : v })
              }
            >
              <SelectTrigger className="h-8 w-auto min-w-[160px] text-sm">
                <SelectValue placeholder="Definir responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Remover responsável</SelectItem>
                {internos.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={pending}
            className="ml-auto"
          >
            <X className="size-4" /> Cancelar
          </Button>
        </div>
      )}

      {/* Colunas do kanban */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {colunas.map(({ status, items }) => (
          <div key={status} className="flex flex-col gap-2">
            {/* Cabeçalho da coluna */}
            <div
              className={cn(
                "flex items-center justify-between rounded-t border-t-4 bg-muted/50 px-2 py-1.5",
                STATUS_COL_CLASS[status],
              )}
            >
              <span className="text-xs font-semibold">{STATUS_LABEL[status]}</span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  vazio
                </div>
              ) : (
                items.map((d) => (
                  <KanbanCard
                    key={d.id}
                    disc={d}
                    selected={selected.has(d.id)}
                    onToggle={() => toggle(d.id)}
                    podeGerir={podeGerir}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
