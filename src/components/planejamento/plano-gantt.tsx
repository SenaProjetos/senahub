"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Flag, ListTree, Lock, Pin } from "lucide-react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import {
  formatarPredecessoras,
  idsComFilhos,
  linhasVisiveis,
  montarGrade,
  soAsDoFiltro,
  textoRecursos,
  type LinhaGrade,
} from "@/modules/planejamento/gantt-linhas";
import { montarEscala, ZOOMS_GANTT, type CalendarioGantt, type EscalaGantt, type ZoomGantt } from "@/modules/planejamento/gantt-escala";
import { caminhoDaSeta, type PosicaoBarra } from "@/modules/planejamento/gantt-setas";
import { criarCalendario, diasUteisEntre } from "@/lib/calendario-trabalho";
import { dataCurta, diasEntre } from "@/lib/dias-iso";
import { brl, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * O cronograma do projeto no molde do MS Project: a TABELA à esquerda e o GRÁFICO à direita, nas mesmas
 * linhas, dentro de UMA área de rolagem — a tabela fica presa à esquerda e o cabeçalho preso em cima,
 * então as duas metades nunca desalinham. Duas visões, como no Project:
 *
 *  - planejamento ("Gráfico de Gantt"): Nº, tarefa, duração, início, término, predecessoras, recursos;
 *  - controle ("Gantt de Controle"): % concluído, datas, linha de base e desvio, com a barra da base
 *    logo abaixo da barra prevista.
 *
 * Apresentacional de propósito: nenhuma action, nenhum `next/*` — quem monta a tela injeta o que fazer ao
 * abrir uma linha e os botões da coluna Ações. Sem `verDatas` (quem só consulta a estrutura) o servidor já
 * mandou as datas vazias: aqui não há gráfico nem coluna de data.
 */

export type ModoGantt = "planejamento" | "controle";

export type PlanoGanttProps = {
  tarefas: EapTarefaDTO[];
  modo: ModoGantt;
  calendario: CalendarioGantt;
  verDatas: boolean;
  mostrarCusto: boolean;
  /** `YYYY-MM-DD` de hoje (a linha vermelha do gráfico). */
  hoje: string;
  /** Ids que passaram nos filtros; `null` = sem filtro (a árvore, com recolher e expandir). */
  filtroIds: ReadonlySet<string> | null;
  selecionadaId?: string | null;
  onAbrir?: (t: EapTarefaDTO) => void;
  /** Botões da coluna Ações, por linha. */
  acoes?: (t: EapTarefaDTO) => ReactNode;
  className?: string;
};

const ROW_H = 28;
const HEAD_H = 48;
const TIER_H = HEAD_H / 2;
const MARCO = 10;

type Linha = LinhaGrade<EapTarefaDTO>;

type Coluna = {
  id: string;
  rotulo: string;
  w: number;
  alinhar?: "right" | "center";
  /** Some na tabela compacta. */
  secundaria?: boolean;
  render: (l: Linha) => ReactNode;
};

const diasDeDesvio = (t: EapTarefaDTO) => (t.fimBaseline && t.fimPrevisto ? diasEntre(t.fimBaseline, t.fimPrevisto) : null);

function zoomInicial(tarefas: EapTarefaDTO[]): ZoomGantt {
  const ini = tarefas.map((t) => t.inicioPrevisto).filter(Boolean).sort();
  const fim = tarefas.map((t) => t.fimPrevisto).filter(Boolean).sort();
  if (ini.length === 0 || fim.length === 0) return "semanas";
  const span = diasEntre(ini[0], fim[fim.length - 1]);
  return span <= 45 ? "dias" : span <= 240 ? "semanas" : "meses";
}

export function PlanoGantt({
  tarefas,
  modo,
  calendario,
  verDatas,
  mostrarCusto,
  hoje,
  filtroIds,
  selecionadaId = null,
  onAbrir,
  acoes,
  className,
}: PlanoGanttProps) {
  const [zoom, setZoom] = useState<ZoomGantt>(() => zoomInicial(tarefas));
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  // Com gráfico, a tabela abre compacta (como o Project abre só com as colunas básicas): a completa deixa o gráfico
  // com uma nesga de tela. Sem gráfico (sem datas) não há o que poupar.
  const [compacto, setCompacto] = useState(verDatas);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);

  const grade = useMemo(() => montarGrade(tarefas), [tarefas]);
  const numeroPorId = useMemo(() => new Map(grade.map((l) => [l.t.id, l.numero])), [grade]);
  const linhas: Linha[] = useMemo(
    () => (filtroIds ? soAsDoFiltro(grade, filtroIds) : linhasVisiveis(grade, recolhidos)),
    [grade, filtroIds, recolhidos],
  );
  const cal = useMemo(() => criarCalendario({ diasSemana: calendario.diasUteis, feriados: calendario.feriados }), [calendario]);

  // A escala cobre TODAS as linhas (não só as visíveis): filtrar ou recolher não pode mexer o gráfico de lugar.
  const escala: EscalaGantt | null = useMemo(() => {
    if (!verDatas) return null;
    const datas = tarefas.flatMap((t) => [t.inicioPrevisto, t.fimPrevisto, t.inicioBaseline, t.fimBaseline]).filter((d): d is string => !!d);
    const ord = [...datas].sort();
    return montarEscala({ min: ord[0] ?? hoje, max: ord[ord.length - 1] ?? hoje, zoom, calendario });
  }, [verDatas, tarefas, zoom, calendario, hoje]);

  const colunas: Coluna[] = useMemo(() => {
    const cs: Coluna[] = [];
    const nome: Coluna = {
      id: "nome",
      rotulo: "Nome da tarefa",
      w: 300,
      render: (l) => {
        const t = l.t;
        const recolhido = recolhidos.has(t.id);
        return (
          <div className="flex min-w-0 items-center" style={{ paddingLeft: 6 + (l.nivel - 1) * 16 }}>
            {l.temFilhos && !filtroIds ? (
              <button
                type="button"
                aria-label={recolhido ? `Expandir ${t.nome}` : `Recolher ${t.nome}`}
                aria-expanded={!recolhido}
                onClick={(e) => {
                  e.stopPropagation();
                  setRecolhidos((atual) => {
                    const novo = new Set(atual);
                    if (novo.has(t.id)) novo.delete(t.id);
                    else novo.add(t.id);
                    return novo;
                  });
                }}
                className="mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {recolhido ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            ) : (
              <span className="mr-0.5 inline-block size-4 shrink-0" aria-hidden />
            )}
            {t.marco && <Flag className="mr-1 size-3 shrink-0 text-primary" aria-label="Marco" />}
            {t.status === "blq" && <Lock className="mr-1 size-3 shrink-0 text-destructive" aria-label="Bloqueada" />}
            {t.status === "con" && (
              <CheckCircle2
                className="mr-1 size-3 shrink-0 text-success"
                aria-label={t.fimReal ? `Concluída em ${dataCurta(t.fimReal)}` : "Concluída"}
              />
            )}
            {t.restricaoTipo && <Pin className="mr-1 size-3 shrink-0 text-muted-foreground" aria-label="Data fixada" />}
            <span className={cn("truncate text-xs", l.temFilhos ? "font-semibold" : "font-medium")} title={t.nome}>
              {t.nome}
            </span>
          </div>
        );
      },
    };
    const numero: Coluna = {
      id: "numero",
      rotulo: "Nº",
      w: 44,
      alinhar: "right",
      render: (l) => <span className="font-mono text-[11px] text-muted-foreground">{l.numero}</span>,
    };
    const duracao: Coluna = {
      id: "duracao",
      rotulo: "Duração",
      w: 76,
      render: (l) => {
        const t = l.t;
        if (t.marco) return <span className="font-mono text-xs text-muted-foreground">marco</span>;
        // Agrupamento não tem duração própria: é o que sobra entre o menor início e o maior término, em dias úteis.
        const dias = l.temFilhos && t.inicioPrevisto && t.fimPrevisto ? diasUteisEntre(t.inicioPrevisto, t.fimPrevisto, cal) : t.duracaoDias;
        return <span className="font-mono text-xs text-muted-foreground">{l.temFilhos && !t.inicioPrevisto ? "—" : `${dias}d`}</span>;
      },
    };
    const inicio: Coluna = {
      id: "inicio",
      rotulo: "Início",
      w: 84,
      render: (l) => <span className="font-mono text-xs">{dataCurta(l.t.inicioPrevisto) || "—"}</span>,
    };
    const termino: Coluna = {
      id: "termino",
      rotulo: "Término",
      w: 84,
      render: (l) => <span className="font-mono text-xs">{dataCurta(l.t.fimPrevisto) || "—"}</span>,
    };
    const progresso: Coluna = {
      id: "progresso",
      rotulo: "% concl.",
      w: 128,
      render: (l) => (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-14 overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-primary" style={{ width: `${l.t.progresso}%` }} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{l.t.progresso}%</span>
          {l.t.progressoDerivado && (
            <span className="text-[9px] uppercase text-muted-foreground" title="Agrupamento: o avanço é calculado dos filhos, ponderado por horas">
              calc
            </span>
          )}
        </div>
      ),
    };
    const predecessoras: Coluna = {
      id: "pred",
      rotulo: "Predecessoras",
      w: 112,
      render: (l) => {
        const texto = formatarPredecessoras(l.t.predecessoras, numeroPorId);
        return <span className="truncate font-mono text-xs text-muted-foreground" title={texto}>{texto}</span>;
      },
    };
    const recursos: Coluna = {
      id: "recursos",
      rotulo: "Nomes dos recursos",
      w: 180,
      secundaria: true,
      render: (l) => {
        const t = l.t;
        if (l.temFilhos) return <span className="text-xs text-muted-foreground">—</span>;
        const texto = textoRecursos(t.atribuicoes, t.deTerceiro);
        const semHoras = t.trabalhoHoras == null && !t.deTerceiro && t.atribuicoes.length > 0 && !t.marco;
        return texto ? (
          <span className="flex min-w-0 items-center gap-1 text-xs" title={t.atribuicoes.map((a) => `${a.nome ?? `(perfil) ${a.rotuloPapel}`} · ${a.rotuloPapel}`).join("\n") || undefined}>
            <span className={cn("truncate", t.deTerceiro && "text-muted-foreground")}>{texto}</span>
            {semHoras && <span className="shrink-0 text-[10px] text-warning" title="Alguma pessoa nesta linha ainda não tem horas estimadas">s/h</span>}
          </span>
        ) : t.marco ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="text-xs text-warning">sem gente</span>
        );
      },
    };
    const disciplina: Coluna = {
      id: "disciplina",
      rotulo: "Disciplina",
      w: 130,
      secundaria: true,
      render: (l) => (
        <span className="truncate text-xs text-muted-foreground" title={l.t.disciplinaNome ?? undefined}>
          {l.t.disciplinaNome ?? "—"}
          {l.t.etapaSigla && <span className="ml-1 font-mono text-[10px]">· {l.t.etapaSigla}</span>}
        </span>
      ),
    };
    const custo: Coluna = {
      id: "custo",
      rotulo: "Custo",
      w: 100,
      alinhar: "right",
      secundaria: true,
      render: (l) => (
        <span className={cn("font-mono text-xs", l.temFilhos ? "" : "text-muted-foreground")}>
          {l.t.custo != null ? brl(l.t.custo) : l.t.custoMotivo === "perfil" || l.t.custoMotivo === "sem_custo_hora" ? <span className="text-warning">s/ custo</span> : "—"}
        </span>
      ),
    };
    const inicioBase: Coluna = {
      id: "inicioBase",
      rotulo: "Início base",
      w: 84,
      secundaria: true,
      render: (l) => <span className="font-mono text-xs text-muted-foreground">{dataCurta(l.t.inicioBaseline) || "—"}</span>,
    };
    const terminoBase: Coluna = {
      id: "terminoBase",
      rotulo: "Término base",
      w: 84,
      secundaria: true,
      render: (l) => <span className="font-mono text-xs text-muted-foreground">{dataCurta(l.t.fimBaseline) || "—"}</span>,
    };
    const desvio: Coluna = {
      id: "desvio",
      rotulo: "Desvio",
      w: 84,
      alinhar: "right",
      render: (l) => {
        const d = diasDeDesvio(l.t);
        if (d == null) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-[11px]",
              d > 0 ? "border-destructive/40 text-destructive" : d < 0 ? "border-success/40 text-success" : "text-muted-foreground",
            )}
          >
            {d > 0 ? `+${d}d` : d < 0 ? `${d}d` : "no prazo"}
          </span>
        );
      },
    };
    const acoesCol: Coluna | null = acoes
      ? {
          id: "acoes",
          rotulo: "Ações",
          w: 76,
          alinhar: "right",
          render: (l) => <div className="flex items-center justify-end gap-0.5">{acoes(l.t)}</div>,
        }
      : null;

    if (!verDatas) cs.push(numero, nome, disciplina, duracao, progresso, predecessoras, recursos);
    else if (modo === "planejamento") cs.push(numero, nome, disciplina, duracao, inicio, termino, predecessoras, recursos);
    else cs.push(numero, nome, progresso, inicio, termino, inicioBase, terminoBase, desvio);
    if (mostrarCusto && (modo === "planejamento" || !verDatas)) cs.push(custo);
    if (acoesCol) cs.push(acoesCol);
    return compacto ? cs.filter((c) => !c.secundaria) : cs;
  }, [modo, verDatas, mostrarCusto, compacto, acoes, numeroPorId, recolhidos, filtroIds, cal]);

  const larguraTabela = colunas.reduce((s, c) => s + c.w, 0);

  // Geometria das barras (só com datas): uma vez por linha visível, para as barras e para as setas.
  const geometria = useMemo(() => {
    const porId = new Map<string, { x: number; w: number; pos: PosicaoBarra }>();
    if (!escala) return porId;
    linhas.forEach((l, i) => {
      const t = l.t;
      if (!t.inicioPrevisto || !t.fimPrevisto) return;
      const x = escala.x(t.inicioPrevisto);
      const w = Math.max(escala.pxPorDia, escala.xFim(t.fimPrevisto) - x);
      const y = i * ROW_H + ROW_H / 2;
      const centro = x + escala.pxPorDia / 2;
      const pos: PosicaoBarra = t.marco ? { xIni: centro - MARCO * 0.7, xFim: centro + MARCO * 0.7, y } : { xIni: x, xFim: x + w, y };
      porId.set(t.id, { x, w, pos });
    });
    return porId;
  }, [escala, linhas]);

  const setas = useMemo(() => {
    const out: { chave: string; d: string }[] = [];
    for (const l of linhas) {
      const suc = geometria.get(l.t.id);
      if (!suc) continue;
      for (const v of l.t.predecessoras) {
        const pred = geometria.get(v.predecessoraId);
        if (!pred) continue;
        out.push({ chave: `${v.predecessoraId}>${l.t.id}`, d: caminhoDaSeta(v.tipo, pred.pos, suc.pos, ROW_H) });
      }
    }
    return out;
  }, [linhas, geometria]);

  // Abre já com o "hoje" à vista — sem isto o projeto que começou meses atrás abre no passado. A tabela fica presa
  // à esquerda e cobre a rolagem, então a janela do gráfico é o que sobra dela: o "hoje" vai para 30% dessa janela.
  const irParaHoje = () => {
    const el = rolagemRef.current;
    if (!el || !escala || !escala.contem(hoje)) return;
    const janelaDoGrafico = Math.max(0, el.clientWidth - larguraTabela);
    el.scrollLeft = Math.max(0, escala.x(hoje) - janelaDoGrafico * 0.3);
  };
  useEffect(() => {
    irParaHoje();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura e ao trocar de zoom
  }, [zoom, verDatas]);

  const todosIds = useMemo(() => idsComFilhos(grade), [grade]);
  const temNivel = todosIds.length > 0;

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {verDatas && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Escala</span>
            <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Escala de tempo">
              {ZOOMS_GANTT.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  aria-pressed={zoom === z.id}
                  onClick={() => setZoom(z.id)}
                  className={cn("px-2.5 py-1 text-xs", zoom === z.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {z.rotulo}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" type="button" onClick={irParaHoje} disabled={!escala?.contem(hoje)} title="Rolar o gráfico até a data de hoje">
              Hoje
            </Button>
          </div>
        )}
        {temNivel && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" type="button" disabled={!!filtroIds} onClick={() => setRecolhidos(new Set(todosIds))} title="Recolher todos os agrupamentos">
              <ChevronsDownUp className="size-3.5" /> Recolher
            </Button>
            <Button size="sm" variant="outline" type="button" disabled={!!filtroIds} onClick={() => setRecolhidos(new Set())} title="Expandir todos os agrupamentos">
              <ChevronsUpDown className="size-3.5" /> Expandir
            </Button>
          </div>
        )}
        <Button size="sm" variant="outline" type="button" aria-pressed={compacto} onClick={() => setCompacto((c) => !c)} title="Esconde as colunas secundárias para dar mais espaço ao gráfico">
          {compacto ? "Tabela completa" : "Tabela compacta"}
        </Button>
        {filtroIds && <span className="text-xs text-muted-foreground">Filtro ativo: mostrando só {linhas.length} linha(s), sem os níveis.</span>}
      </div>

      {linhas.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhuma tarefa para os filtros selecionados" className="py-10" />
      ) : (
        <div ref={rolagemRef} className="relative max-h-[72vh] overflow-auto rounded-sm border bg-background" role="region" aria-label="Cronograma: tabela e gráfico">
          <div className="flex min-w-max">
            {/* ── Tabela ── */}
            <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: larguraTabela }} role="table" aria-label="Tarefas">
              <div className="sticky top-0 z-30 flex border-b bg-muted" style={{ height: HEAD_H }} role="row">
                {colunas.map((c) => (
                  <div
                    key={c.id}
                    role="columnheader"
                    className={cn(
                      "flex shrink-0 items-center border-r px-2 font-mono text-[10px] uppercase leading-tight tracking-[0.08em] text-muted-foreground last:border-r-0",
                      c.alinhar === "right" && "justify-end text-right",
                      c.alinhar === "center" && "justify-center text-center",
                    )}
                    style={{ width: c.w }}
                  >
                    {c.rotulo}
                  </div>
                ))}
              </div>
              {linhas.map((l) => (
                <div
                  key={l.t.id}
                  role="row"
                  tabIndex={onAbrir ? 0 : undefined}
                  onClick={() => onAbrir?.(l.t)}
                  onKeyDown={(e) => {
                    if (onAbrir && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onAbrir(l.t);
                    }
                  }}
                  onMouseEnter={() => setHoverId(l.t.id)}
                  onMouseLeave={() => setHoverId((h) => (h === l.t.id ? null : h))}
                  className={cn(
                    "flex border-b bg-background",
                    l.temFilhos && "bg-muted/40",
                    hoverId === l.t.id && "bg-muted",
                    selecionadaId === l.t.id && "bg-primary/10",
                    onAbrir && "cursor-pointer",
                  )}
                  style={{ height: ROW_H }}
                >
                  {colunas.map((c) => (
                    <div
                      key={c.id}
                      role="cell"
                      className={cn(
                        "flex min-w-0 shrink-0 items-center overflow-hidden border-r border-border/50 px-2 last:border-r-0",
                        c.alinhar === "right" && "justify-end",
                        c.alinhar === "center" && "justify-center",
                        c.id === "nome" && "px-0 pr-2",
                      )}
                      style={{ width: c.w }}
                    >
                      {c.render(l)}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* ── Gráfico ── */}
            {escala && (
              <div className="relative shrink-0" style={{ width: escala.largura }}>
                <div className="sticky top-0 z-10 border-b bg-muted" style={{ height: HEAD_H }} aria-hidden>
                  <div className="relative border-b" style={{ height: TIER_H }}>
                    {escala.topo.map((f) => (
                      <div key={f.chave} title={f.titulo} className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-l px-1.5 text-[11px] font-medium" style={{ left: f.x, width: f.largura }}>
                        {f.rotulo}
                      </div>
                    ))}
                  </div>
                  <div className="relative" style={{ height: TIER_H }}>
                    {escala.base.map((f) => (
                      <div key={f.chave} title={f.titulo} className="absolute top-0 flex h-full items-center justify-center overflow-hidden whitespace-nowrap border-l text-[10px] text-muted-foreground" style={{ left: f.x, width: f.largura }}>
                        {f.rotulo}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative" style={{ height: linhas.length * ROW_H }}>
                  {/* dia não útil */}
                  {escala.naoUteis.map((f) => (
                    <div key={f.x} className="absolute inset-y-0 bg-muted/70" style={{ left: f.x, width: f.largura }} aria-hidden />
                  ))}
                  {/* divisas das faixas de cima (semana, mês ou ano) */}
                  {escala.topo.map((f) => (
                    <div key={`d${f.chave}`} className="absolute inset-y-0 w-px bg-border/70" style={{ left: f.x }} aria-hidden />
                  ))}
                  {/* linhas: uma faixa por linha da tabela, com as barras dentro */}
                  {linhas.map((l, i) => (
                    <BarraDaLinha
                      key={l.t.id}
                      l={l}
                      modo={modo}
                      escala={escala}
                      geo={geometria.get(l.t.id)}
                      top={i * ROW_H}
                      destaque={hoverId === l.t.id || selecionadaId === l.t.id}
                      onHover={(h) => setHoverId((atual) => (h ? l.t.id : atual === l.t.id ? null : atual))}
                      onAbrir={onAbrir}
                    />
                  ))}
                  {/* setas de dependência */}
                  <svg className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible text-muted-foreground" width={escala.largura} height={linhas.length * ROW_H} aria-hidden>
                    <defs>
                      <marker id="plano-seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M 0 0 L 6 3 L 0 6 Z" fill="currentColor" />
                      </marker>
                    </defs>
                    {setas.map((s) => (
                      <path key={s.chave} d={s.d} stroke="currentColor" strokeWidth="1.25" fill="none" opacity="0.75" markerEnd="url(#plano-seta)" />
                    ))}
                  </svg>
                  {/* hoje */}
                  {escala.contem(hoje) && (
                    <div className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-destructive/70" style={{ left: escala.x(hoje) + escala.pxPorDia / 2 }} title="Hoje" aria-hidden />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {verDatas && linhas.length > 0 && <Legenda modo={modo} tarefas={tarefas} />}
    </div>
  );
}

function BarraDaLinha({
  l,
  modo,
  escala,
  geo,
  top,
  destaque,
  onHover,
  onAbrir,
}: {
  l: Linha;
  modo: ModoGantt;
  escala: EscalaGantt;
  geo: { x: number; w: number } | undefined;
  top: number;
  destaque: boolean;
  onHover: (dentro: boolean) => void;
  onAbrir?: (t: EapTarefaDTO) => void;
}) {
  const t = l.t;
  const bloqueada = t.status === "blq";
  const critica = t.critica && t.status !== "con";
  const titulo =
    [
      bloqueada && `bloqueada: ${t.motivoBloqueio ?? "sem motivo registrado"}`,
      t.restricaoTipo && `restrição: ${t.restricaoTipo} ${t.restricaoData ?? ""}`.trim(),
      t.conflitoRestricao && "conflito entre a restrição e a dependência",
      t.reprogramada && "reprogramada para depois da Data de Status",
      t.folgaTotal > 0 && `folga ${t.folgaTotal}d`,
      critica && "caminho crítico (folga 0)",
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  const baseIni = t.inicioBaseline ? escala.x(t.inicioBaseline) : null;
  const baseFim = t.fimBaseline ? escala.xFim(t.fimBaseline) : null;
  const desviada = t.fimBaseline != null && t.fimPrevisto > t.fimBaseline;

  return (
    <div
      className={cn("absolute inset-x-0 overflow-hidden border-b border-border/50", destaque && "bg-muted/60")}
      style={{ top, height: ROW_H }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => onAbrir?.(t)}
    >
      {geo && (
        <>
          {t.marco ? (
            <div
              className={cn("absolute rotate-45 border", critica ? "border-destructive bg-destructive" : "border-foreground bg-foreground")}
              style={{ left: geo.x + escala.pxPorDia / 2 - MARCO / 2, top: (ROW_H - MARCO) / 2, width: MARCO, height: MARCO }}
              title={titulo ?? `Marco: ${t.nome}`}
            />
          ) : l.temFilhos ? (
            <div title={titulo}>
              <div className={cn("absolute", critica ? "bg-destructive" : "bg-foreground")} style={{ left: geo.x, width: geo.w, top: 8, height: 6 }} />
              {[geo.x, geo.x + geo.w - 10].map((left) => (
                <div
                  key={left}
                  className={cn("absolute h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent", critica ? "border-t-destructive" : "border-t-foreground")}
                  style={{ left, top: 14 }}
                />
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "absolute overflow-hidden rounded-sm border",
                bloqueada
                  ? "border-destructive [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,color-mix(in_srgb,var(--color-destructive)_35%,transparent)_3px,color-mix(in_srgb,var(--color-destructive)_35%,transparent)_6px)]"
                  : critica
                    ? "border-destructive bg-destructive/20"
                    : "border-primary/50 bg-primary/25",
              )}
              style={{ left: geo.x, width: geo.w, top: 7, height: 14 }}
              title={titulo}
            >
              {!bloqueada && <div className={cn("h-full", critica ? "bg-destructive" : "bg-primary")} style={{ width: `${t.progresso}%` }} />}
            </div>
          )}
          {modo === "controle" && baseIni != null && baseFim != null && !t.marco && (
            <div
              className={cn("absolute rounded-sm", desviada ? "bg-destructive/50" : "bg-muted-foreground/40")}
              style={{ left: baseIni, width: Math.max(escala.pxPorDia, baseFim - baseIni), top: 22, height: 4 }}
              title="Linha de base"
            />
          )}
          <span
            className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
            style={{ left: geo.x + geo.w + (t.marco ? MARCO : 6) }}
          >
            {modo === "controle" ? `${t.progresso}%` : l.temFilhos ? "" : textoRecursos(t.atribuicoes, t.deTerceiro)}
          </span>
        </>
      )}
    </div>
  );
}

function Legenda({ modo, tarefas }: { modo: ModoGantt; tarefas: EapTarefaDTO[] }) {
  const temCritico = tarefas.some((t) => t.critica);
  const temMarco = tarefas.some((t) => t.marco);
  const temResumo = tarefas.some((t) => tarefas.some((f) => f.parentId === t.id));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm border border-primary/50 bg-primary/25" aria-hidden /> Tarefa (o preenchimento é o % concluído)
      </span>
      {temResumo && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-5 bg-foreground" aria-hidden /> Agrupamento
        </span>
      )}
      {temMarco && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rotate-45 bg-foreground" aria-hidden /> Marco
        </span>
      )}
      {temCritico && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm border border-destructive bg-destructive/20" aria-hidden /> Caminho crítico
        </span>
      )}
      {modo === "controle" && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded-sm bg-muted-foreground/40" aria-hidden /> Linha de base
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Pin className="size-3" aria-hidden /> Data fixada
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-3 bg-muted" aria-hidden /> Dia não útil
      </span>
    </div>
  );
}
