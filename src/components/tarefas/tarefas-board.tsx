"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { Plus, GripVertical, Lock, CalendarDays, LayoutGrid, List, FilterX } from "lucide-react";
import { moverTarefa } from "@/modules/tarefas/actions";
import { podeMoverTarefa, MOTIVO_NAO_MOVE } from "@/modules/tarefas/regras";
import { PRIORIDADES, PRIORIDADE_LABEL, PRIORIDADE_CLASS, ehPrioridade } from "@/modules/tarefas/prioridade";
import { TarefaDialog, type TarefaUI, type OpcoesUI } from "./tarefa-dialog";
import { useAcoesTarefa } from "./use-acoes-tarefa";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
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
import { AvatarGroup } from "@/components/ui/avatar";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Pagination } from "@/components/ui/pagination";
import { prazoVencido } from "@/lib/data";
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

/** Menu da área vazia da coluna — ações do quadro, não de uma tarefa. */
const ACAO_NOVA_AQUI = "nova-tarefa-aqui";
const ACAO_LIMPAR_FILTROS = "limpar-filtros";

export function TarefasBoard({
  colunas,
  opcoes,
  meId,
  meRole,
  gereTodasTarefas,
  page,
  pageCount,
  pageSize,
  total,
}: {
  colunas: Coluna[];
  opcoes: OpcoesUI;
  meId: string;
  meRole: string;
  /** `tarefas:gerir_todas`, resolvido no servidor. */
  gereTodasTarefas: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const setParams = useSetParams();
  const searchParams = useSearchParams();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<TarefaUI | null>(null);
  // `{ nova }` carrega a coluna de destino de "Nova tarefa em X" (menu da área da coluna).
  const [dialog, setDialog] = useState<TarefaUI | { nova: true; statusId?: string } | null>(null);
  const novaEm = dialog && "nova" in dialog ? dialog : null;
  const tarefaDoDialog = dialog && !("nova" in dialog) ? dialog : null;
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

  // As opções não dependem da página corrente: os filtros são aplicados no servidor.
  const { opcoesProjeto, opcoesResponsavel, opcoesDisciplina } = useMemo(() => {
    return {
      opcoesProjeto: opcoes.projetos.map((p) => ({ id: p.id, rotulo: p.codigo })),
      opcoesResponsavel: opcoes.internos.map((u) => ({ id: u.id, nome: u.name })),
      opcoesDisciplina: opcoes.disciplinas
        .filter((d) => !projeto || d.projetoId === projeto)
        .map((d) => ({ id: d.id, nome: d.nome })),
    };
  }, [opcoes.disciplinas, opcoes.internos, opcoes.projetos, projeto]);

  const temFiltro = Boolean(q || projeto || disciplina || responsavel || periodo || prioridade);

  function aplicarBusca() {
    setParams({ q: busca.trim() || null });
  }

  function limparFiltros() {
    setParams({ q: null, projeto: null, disciplina: null, responsavel: null, periodo: null, prioridade: null });
  }

  // Um hook por lista: os diálogos e o confirm são montados uma vez; cada card/linha só recebe
  // os itens. O mesmo par alimenta o menu de contexto e o `...`.
  const abrirTarefa = useCallback((t: TarefaUI) => setDialog(t), []);
  const colunasAcoes = useMemo(
    () => colunas.map((c) => ({ id: c.id, nome: c.nome, concluido: c.concluido })),
    [colunas],
  );
  const acoes = useAcoesTarefa<TarefaUI>({
    meId,
    gereTodas: gereTodasTarefas,
    colunas: colunasAcoes,
    onAbrir: abrirTarefa,
  });

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
    const tarefa = origem.tarefas.find((t) => t.id === tarefaId);
    if (!tarefa || !podeMoverTarefa(tarefa, meId, gereTodasTarefas)) {
      toast.error(MOTIVO_NAO_MOVE);
      return;
    }
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
          <Button onClick={() => setDialog({ nova: true })}>
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
          <Button variant="ghost" size="sm" className="h-8" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        )}
      </div>

      <DicaMenuContexto />

      {vista === "lista" ? (
        <ListaView colunas={colunas} onAbrir={abrirTarefa} acoes={acoes} />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {/* Grid responsivo: colunas preenchem a largura e quebram em telas estreitas (sem scroll-h / corte). */}
          <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {colunas.map((col) => (
              <ColunaView
                key={col.id}
                col={col}
                onAbrir={abrirTarefa}
                meId={meId}
                gereTodas={gereTodasTarefas}
                acoes={acoes}
                temFiltro={temFiltro}
                onNovaTarefa={(statusId) => setDialog({ nova: true, statusId })}
                onLimparFiltros={limparFiltros}
              />
            ))}
          </div>
          <DragOverlay>{arrastando ? <CardTarefa t={arrastando} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />

      <TarefaDialog
        tarefa={tarefaDoDialog}
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        valoresIniciais={novaEm?.statusId ? { statusId: novaEm.statusId } : undefined}
        opcoes={opcoes}
        colunas={colunas.map((c) => ({ id: c.id, nome: c.nome }))}
        meId={meId}
        meRole={meRole}
        gereTodasTarefas={gereTodasTarefas}
      />
    </div>
  );
}

/** Par devolvido por `useAcoesTarefa`, repassado às vistas que renderizam tarefas. */
type AcoesTarefa = {
  itens: (t: TarefaUI) => AcaoItem[];
  aoSelecionar: (t: TarefaUI, item: AcaoItemAcao) => void;
};

/** Visão LISTA: tabela plana das tarefas filtradas, ordenável localmente por prazo. */
function ListaView({
  colunas,
  onAbrir,
  acoes,
}: {
  colunas: Coluna[];
  onAbrir: (t: TarefaUI) => void;
  acoes: AcoesTarefa;
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
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma tarefa.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map(({ t, statusNome, statusCor }) => {
              const atrasada = prazoVencido(t.prazo);
              const itens = acoes.itens(t);
              return (
                <ContextMenu key={t.id}>
                  <ContextMenuTrigger
                    render={
                      <TableRow
                        className="group cursor-pointer data-[popup-open]:bg-muted/50"
                        onClick={() => onAbrir(t)}
                      />
                    }
                  >
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
                      {t.responsaveis.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <AvatarGroup>
                            {t.responsaveis.slice(0, 3).map((r) => (
                              <AvatarUsuario key={r.id} nome={r.nome} image={r.image} size="sm" className="size-5" fallbackClassName="text-[9px]" />
                            ))}
                          </AvatarGroup>
                          <span className="truncate">{t.responsaveis.map((r) => r.nome).join(", ")}</span>
                        </span>
                      ) : (
                        "—"
                      )}
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
                    {/* Clique no `...` não pode abrir a tarefa junto (a linha inteira é clicável). */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <BotaoAcoes
                        itens={itens}
                        onSelect={(item) => acoes.aoSelecionar(t, item)}
                        rotulo={`Ações da tarefa ${t.titulo}`}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                      />
                    </TableCell>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <AcoesMenuItens itens={itens} onSelect={(item) => acoes.aoSelecionar(t, item)} />
                  </ContextMenuContent>
                </ContextMenu>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ColunaView({
  col,
  onAbrir,
  meId,
  gereTodas,
  acoes,
  temFiltro,
  onNovaTarefa,
  onLimparFiltros,
}: {
  col: Coluna;
  onAbrir: (t: TarefaUI) => void;
  meId: string;
  gereTodas: boolean;
  acoes: AcoesTarefa;
  temFiltro: boolean;
  onNovaTarefa: (statusId: string) => void;
  onLimparFiltros: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  // No toque, o Chrome ainda dispara o evento de menu de contexto ao SOLTAR o dedo, depois de o card
  // já ter aberto o dele pelo toque longo. Esse segundo evento caía na coluna e abria o menu dela
  // por cima do card. Enquanto um card desta coluna tiver menu aberto, a coluna não responde.
  const [menuDeCardAberto, setMenuDeCardAberto] = useState(false);

  // Paridade (regra 2 da ADR-0002): "Nova tarefa em X" não ganha botão próprio — o botão
  // "Nova tarefa" do topo mais o Select de status do diálogo chegam ao mesmo lugar pelo
  // teclado. O menu só economiza um passo; "Limpar filtros" já tem botão na barra de filtros.
  const itensDaColuna: AcaoItem[] = [
    { tipo: "acao", id: ACAO_NOVA_AQUI, rotulo: `Nova tarefa em ${col.nome}`, icone: Plus },
    ...(temFiltro
      ? [{ tipo: "acao", id: ACAO_LIMPAR_FILTROS, rotulo: "Limpar filtros", icone: FilterX } as AcaoItem]
      : []),
  ];

  function aoSelecionarDaColuna(item: AcaoItemAcao) {
    if (item.id === ACAO_NOVA_AQUI) onNovaTarefa(col.id);
    else if (item.id === ACAO_LIMPAR_FILTROS) onLimparFiltros();
  }

  return (
    <div className="min-w-0">
      {/* O Trigger envolve o TÍTULO junto com a área dos cards: só a borda tracejada era alvo
          pequeno demais para o botão direito, já que a margem entre cards é estreita.
          O Trigger do card é aninhado neste — o botão direito num card abre só o menu do card. */}
      <ContextMenu disabled={menuDeCardAberto}>
        <ContextMenuTrigger className="block">
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
            {col.tarefas.map((t, i) => (
              <DraggableTarefa
                key={t.id}
                t={t}
                onAbrir={onAbrir}
                podeMover={podeMoverTarefa(t, meId, gereTodas)}
                acoes={acoes}
                primeiro={i === 0}
                onMenuAberto={setMenuDeCardAberto}
              />
            ))}
            {col.tarefas.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">vazio</p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <AcoesMenuItens itens={itensDaColuna} onSelect={aoSelecionarDaColuna} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

function DraggableTarefa({
  t,
  onAbrir,
  podeMover,
  acoes,
  primeiro,
  onMenuAberto,
}: {
  t: TarefaUI;
  onAbrir: (t: TarefaUI) => void;
  podeMover: boolean;
  acoes: AcoesTarefa;
  /** Primeiro card da coluna: alvo do coachmark do menu de contexto. */
  primeiro?: boolean;
  /** Avisa a coluna: com o menu do card aberto, o da coluna não pode abrir junto. */
  onMenuAberto?: (aberto: boolean) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: t.id, disabled: !podeMover });
  // No toque, o dedo soltando depois do toque longo ainda dispara o `click` do corpo do card —
  // sem esta trava o menu abriria junto com o diálogo da tarefa.
  const menuAberto = useRef(false);
  const itens = acoes.itens(t);
  const aoSelecionar = (item: AcaoItemAcao) => acoes.aoSelecionar(t, item);

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <ContextMenu
        onOpenChange={(aberto) => {
          menuAberto.current = aberto;
          onMenuAberto?.(aberto);
        }}
      >
        <ContextMenuTrigger className="block">
          <CardTarefa
            t={t}
            onAbrir={(tarefa) => {
              if (!menuAberto.current) onAbrir(tarefa);
            }}
            dragProps={podeMover ? { ...attributes, ...listeners } : undefined}
            podeMover={podeMover}
            acoes={{ itens, aoSelecionar }}
            primeiro={primeiro}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <AcoesMenuItens itens={itens} onSelect={aoSelecionar} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

function CardTarefa({
  t,
  onAbrir,
  dragProps,
  podeMover = true,
  overlay,
  acoes,
  primeiro,
}: {
  t: TarefaUI;
  onAbrir?: (t: TarefaUI) => void;
  dragProps?: Record<string, unknown>;
  podeMover?: boolean;
  overlay?: boolean;
  /** Ausente no fantasma do arrasto (`DragOverlay`), que não tem menu nem `...`. */
  acoes?: { itens: AcaoItem[]; aoSelecionar: (item: AcaoItemAcao) => void };
  primeiro?: boolean;
}) {
  const feitos = t.itens.filter((i) => i.concluido).length;
  const atrasada = prazoVencido(t.prazo);
  return (
    <div
      data-tour={primeiro ? "menu-contexto" : undefined}
      className={`group rounded-sm border bg-card p-2.5 text-sm shadow-sm ${overlay ? "rotate-2" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {/* `touch-none`: sem ele o navegador trata o gesto na alça como rolagem e cancela o
            ponteiro antes dos 6px que o dnd-kit exige — arrastar simplesmente não acontecia no
            toque. `onTouchStart` que para a propagação impede o toque longo do menu de contexto
            de disparar aqui: na alça, segurar é para arrastar, não para abrir menu. */}
        <button
          type="button"
          className={
            podeMover
              ? "mt-0.5 cursor-grab touch-none text-muted-foreground"
              : "mt-0.5 cursor-not-allowed text-muted-foreground/30"
          }
          aria-label={podeMover ? "Arrastar" : MOTIVO_NAO_MOVE}
          title={podeMover ? undefined : MOTIVO_NAO_MOVE}
          disabled={!podeMover}
          onTouchStart={podeMover ? (e) => e.stopPropagation() : undefined}
          {...dragProps}
        >
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
          </div>
          {t.itens.length > 0 && (
            <div className="mt-2 flex items-center gap-2" aria-label={`Checklist: ${feitos} de ${t.itens.length} itens concluídos`}>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">☑ {feitos}/{t.itens.length}</span>
              <div
                className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-sm bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={t.itens.length}
                aria-valuenow={feitos}
                aria-label="Progresso do checklist"
              >
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${(feitos / t.itens.length) * 100}%` }} />
              </div>
            </div>
          )}
          {t.responsaveis.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <AvatarGroup>
                {t.responsaveis.slice(0, 4).map((r) => (
                  <AvatarUsuario key={r.id} nome={r.nome} image={r.image} size="sm" className="size-5" fallbackClassName="text-[9px]" />
                ))}
              </AvatarGroup>
              {t.responsaveis.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{t.responsaveis.length - 4}</span>
              )}
            </div>
          )}
        </button>
        {/* Irmão do corpo do card, nunca aninhado: o corpo já é um <button>. */}
        {acoes && (
          <BotaoAcoes
            itens={acoes.itens}
            onSelect={acoes.aoSelecionar}
            rotulo={`Ações da tarefa ${t.titulo}`}
            className="-mt-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          />
        )}
      </div>
    </div>
  );
}
