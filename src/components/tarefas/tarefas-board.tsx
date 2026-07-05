"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetParams } from "@/lib/use-set-param";
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
import { Plus, GripVertical, Lock, CalendarDays, LayoutGrid, List } from "lucide-react";
import { moverTarefa } from "@/modules/tarefas/actions";
import { PRIORIDADES, PRIORIDADE_LABEL, PRIORIDADE_CLASS, ehPrioridade } from "@/modules/tarefas/prioridade";
import { TarefaDialog, type TarefaUI, type OpcoesUI } from "./tarefa-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Coluna = {
  id: string;
  nome: string;
  cor: string | null;
  concluido: boolean;
  tarefas: TarefaUI[];
};

/** Sentinela para "sem filtro" nos Selects (base-ui não aceita value vazio). */
const TODOS = "__todos";
type Periodo = "atrasadas" | "semana" | "mes";

/** Aplica os filtros de URL ao conjunto plano de tarefas (cliente-side). */
function filtrarTarefa(
  t: TarefaUI,
  concluida: boolean,
  filtros: { q: string; projeto: string | null; disciplina: string | null; responsavel: string | null; periodo: string | null; prioridade: string | null },
): boolean {
  const { q, projeto, disciplina, responsavel, periodo, prioridade } = filtros;

  if (q) {
    const termo = q.toLowerCase();
    const alvo = `${t.titulo} ${t.descricao ?? ""}`.toLowerCase();
    if (!alvo.includes(termo)) return false;
  }

  if (projeto && t.projetoId !== projeto) return false;

  if (disciplina && t.disciplinaId !== disciplina) return false;

  if (responsavel && !t.responsaveis.some((r) => r.id === responsavel)) return false;

  if (prioridade && t.prioridade !== prioridade) return false;

  if (periodo) {
    if (!t.prazo) return false;
    // prazo é "YYYY-MM-DD"; interpreta como data local à meia-noite.
    const [ano, mes, dia] = t.prazo.split("-").map(Number);
    if (!ano || !mes || !dia) return false;
    const prazo = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (periodo === "atrasadas") {
      if (concluida || prazo >= hoje) return false;
    } else if (periodo === "semana") {
      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + 7);
      if (prazo < hoje || prazo > limite) return false;
    } else if (periodo === "mes") {
      if (prazo.getMonth() !== hoje.getMonth() || prazo.getFullYear() !== hoje.getFullYear())
        return false;
    }
  }

  return true;
}

export function TarefasBoard({
  colunas,
  opcoes,
  meId,
  meRole,
}: {
  colunas: Coluna[];
  opcoes: OpcoesUI;
  meId: string;
  meRole: string;
}) {
  const router = useRouter();
  const setParams = useSetParams();
  const searchParams = useSearchParams();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<TarefaUI | null>(null);
  const [dialog, setDialog] = useState<TarefaUI | null | "nova">(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const q = searchParams.get("q") ?? "";
  const projeto = searchParams.get("projeto");
  const disciplina = searchParams.get("disciplina");
  const responsavel = searchParams.get("responsavel");
  const periodo = searchParams.get("periodo");
  const prioridade = searchParams.get("prioridade");
  const vista = searchParams.get("vista") === "lista" ? "lista" : "quadro";

  // Input de busca controlado localmente; só escreve na URL no Enter/blur.
  const [busca, setBusca] = useState(q);
  useEffect(() => setBusca(q), [q]);

  // Opções distintas a partir das tarefas carregadas (com fallback nos rótulos via opcoes).
  const { opcoesProjeto, opcoesResponsavel, opcoesDisciplina } = useMemo(() => {
    const todas = colunas.flatMap((c) => c.tarefas);
    const projMap = new Map<string, string>();
    const respMap = new Map<string, string>();
    const discMap = new Map<string, string>();
    for (const t of todas) {
      if (t.projetoId) {
        const rotulo = opcoes.projetos.find((p) => p.id === t.projetoId)?.codigo ?? t.projetoCodigo ?? t.projetoId;
        projMap.set(t.projetoId, rotulo);
      }
      // Disciplinas do projeto filtrado (ou de todos, se nenhum projeto selecionado).
      if (t.disciplinaId && (!projeto || t.projetoId === projeto)) {
        const nome = opcoes.disciplinas.find((d) => d.id === t.disciplinaId)?.nome ?? t.disciplinaId;
        discMap.set(t.disciplinaId, nome);
      }
      for (const r of t.responsaveis) respMap.set(r.id, r.nome);
    }
    return {
      opcoesProjeto: [...projMap].map(([id, rotulo]) => ({ id, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
      opcoesResponsavel: [...respMap].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      opcoesDisciplina: [...discMap].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [colunas, opcoes.projetos, opcoes.disciplinas, projeto]);

  const filtros = { q, projeto, disciplina, responsavel, periodo, prioridade };
  // Reaplica os filtros mantendo a estrutura de colunas (preserva o dnd-kit).
  const colunasFiltradas = useMemo<Coluna[]>(
    () =>
      colunas.map((c) => ({
        ...c,
        tarefas: c.tarefas.filter((t) => filtrarTarefa(t, c.concluido, filtros)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colunas, q, projeto, disciplina, responsavel, periodo, prioridade],
  );

  const temFiltro = Boolean(q || projeto || disciplina || responsavel || periodo || prioridade);

  function aplicarBusca() {
    setParams({ q: busca.trim() || null });
  }

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
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-sm border p-0.5">
            <Button
              type="button"
              variant={vista === "quadro" ? "secondary" : "ghost"}
              size="icon"
              className="size-7"
              aria-label="Visão em quadro"
              aria-pressed={vista === "quadro"}
              onClick={() => setParams({ vista: null })}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              type="button"
              variant={vista === "lista" ? "secondary" : "ghost"}
              size="icon"
              className="size-7"
              aria-label="Visão em lista"
              aria-pressed={vista === "lista"}
              onClick={() => setParams({ vista: "lista" })}
            >
              <List className="size-4" />
            </Button>
          </div>
          <Button onClick={() => setDialog("nova")}>
            <Plus className="size-4" /> Nova tarefa
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicarBusca();
          }}
          onBlur={aplicarBusca}
          placeholder="Buscar por título ou descrição…"
          className="h-8 w-full sm:w-64"
        />

        <Select
          value={projeto ?? TODOS}
          onValueChange={(v) => setParams({ projeto: v && v !== TODOS ? v : null, disciplina: null })}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os projetos</SelectItem>
            {opcoesProjeto.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {opcoesDisciplina.length > 0 && (
          <Select
            value={disciplina ?? TODOS}
            onValueChange={(v) => setParams({ disciplina: v && v !== TODOS ? v : null })}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Disciplina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as disciplinas</SelectItem>
              {opcoesDisciplina.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={responsavel ?? TODOS}
          onValueChange={(v) => setParams({ responsavel: v && v !== TODOS ? v : null })}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
            {opcoesResponsavel.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={periodo ?? TODOS}
          onValueChange={(v) => setParams({ periodo: v && v !== TODOS ? v : null })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Qualquer prazo</SelectItem>
            <SelectItem value={"atrasadas" satisfies Periodo}>Atrasadas</SelectItem>
            <SelectItem value={"semana" satisfies Periodo}>Próximos 7 dias</SelectItem>
            <SelectItem value={"mes" satisfies Periodo}>Mês atual</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={prioridade ?? TODOS}
          onValueChange={(v) => setParams({ prioridade: v && v !== TODOS ? v : null })}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Qualquer prioridade</SelectItem>
            {PRIORIDADES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setParams({ q: null, projeto: null, disciplina: null, responsavel: null, periodo: null, prioridade: null })}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {vista === "lista" ? (
        <ListaView colunas={colunasFiltradas} onAbrir={(t) => setDialog(t)} />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {/* Grid responsivo: colunas preenchem a largura e quebram em telas estreitas (sem scroll-h / corte). */}
          <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {colunasFiltradas.map((col) => (
              <ColunaView key={col.id} col={col} onAbrir={(t) => setDialog(t)} />
            ))}
          </div>
          <DragOverlay>{arrastando ? <CardTarefa t={arrastando} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <TarefaDialog
        tarefa={dialog === "nova" ? null : dialog}
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        opcoes={opcoes}
        colunas={colunas.map((c) => ({ id: c.id, nome: c.nome }))}
        meId={meId}
        meRole={meRole}
      />
    </div>
  );
}

/** Visão LISTA: tabela plana das tarefas filtradas, ordenável localmente por prazo. */
function ListaView({
  colunas,
  onAbrir,
}: {
  colunas: Coluna[];
  onAbrir: (t: TarefaUI) => void;
}) {
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Achata as colunas em linhas, preservando nome/cor do status de cada tarefa.
  const linhas = useMemo(() => {
    const flat = colunas.flatMap((c) =>
      c.tarefas.map((t) => ({ t, statusNome: c.nome, statusCor: c.cor })),
    );
    // Ordena por prazo (sem prazo vai para o fim em ambas as direções).
    flat.sort((a, b) => {
      const pa = a.t.prazo || "";
      const pb = b.t.prazo || "";
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      return dir === "asc" ? pa.localeCompare(pb) : pb.localeCompare(pa);
    });
    return flat;
  }, [colunas, dir]);

  return (
    <div className="rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead className="w-28">Projeto</TableHead>
            <TableHead>Responsáveis</TableHead>
            <TableHead className="w-32">
              <button
                type="button"
                onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="inline-flex items-center gap-1 hover:text-foreground"
                aria-label="Ordenar por prazo"
              >
                Prazo
                <CalendarDays className="size-3.5 text-muted-foreground/60" aria-hidden />
                <span className="text-xs">{dir === "asc" ? "↑" : "↓"}</span>
              </button>
            </TableHead>
            <TableHead className="w-40">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma tarefa.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map(({ t, statusNome, statusCor }) => {
              const atrasada = t.prazo && new Date(t.prazo) < new Date(new Date().toDateString());
              return (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => onAbrir(t)}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {t.bloqueada && <Lock className="size-3.5 text-warning" />}
                      {t.titulo}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.projetoCodigo ? (
                      <>
                        <span className="font-mono">{formatarCodigo(t.projetoCodigo)}</span>
                        {t.projetoNome && <span className="ml-1">{t.projetoNome}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.responsaveis.length > 0
                      ? t.responsaveis.map((r) => r.nome).join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className={`text-sm ${atrasada ? "text-destructive" : ""}`}>
                    {t.prazo ? formatarData(t.prazo) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: statusCor ?? "#576980" }}
                      />
                      {statusNome}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ColunaView({ col, onAbrir }: { col: Coluna; onAbrir: (t: TarefaUI) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: col.cor ?? "#576980" }} />
        <span className="text-sm font-semibold">{col.nome}</span>
        <Badge variant="outline" className="ml-auto">
          {col.tarefas.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[16rem] space-y-2 rounded-sm border p-2 transition-colors ${
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
            {ehPrioridade(t.prioridade) && (
              <Badge variant="outline" className={`h-4 px-1 text-[9px] leading-none ${PRIORIDADE_CLASS[t.prioridade]}`}>
                {PRIORIDADE_LABEL[t.prioridade]}
              </Badge>
            )}
            {t.projetoCodigo && (
              <span className="truncate">
                <span className="font-mono">{formatarCodigo(t.projetoCodigo)}</span>
                {t.projetoNome && ` ${t.projetoNome}`}
              </span>
            )}
            {t.prazo && (
              <span className={`flex items-center gap-1 ${atrasada ? "text-destructive" : ""}`}>
                <CalendarDays className="size-3" />
                {formatarData(t.prazo)}
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
