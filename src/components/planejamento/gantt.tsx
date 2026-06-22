import { differenceInCalendarDays, addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ListChecks, Flag } from "lucide-react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { calcularCaminhoCritico } from "@/modules/planejamento/caminho-critico";
import { EmptyState } from "@/components/ui/empty-state";

export const GANTT_PX_DEFAULT = 18; // pixels por dia
const ROW = 34; // altura da linha (px)
const LABEL_W = 220;
const ARROW_ELBOW = 8; // margem horizontal do cotovelo das setas de dependência

const parse = (iso: string) => new Date(iso + "T00:00:00");

/** Gantt com barra atual (prevista) + barra de linha de base, eixo por mês e marcador de hoje. */
export function Gantt({
  tarefas,
  onSelecionar,
  px = GANTT_PX_DEFAULT,
}: {
  tarefas: EapTarefaDTO[];
  onSelecionar?: (id: string) => void;
  px?: number;
}) {
  if (tarefas.length === 0) {
    return (
      <EmptyState icon={ListChecks} title="Sem tarefas para exibir no cronograma" />
    );
  }

  // Janela de datas (inclui baseline).
  const datas: Date[] = [];
  for (const t of tarefas) {
    datas.push(parse(t.inicioPrevisto), parse(t.fimPrevisto));
    if (t.inicioBaseline) datas.push(parse(t.inicioBaseline));
    if (t.fimBaseline) datas.push(parse(t.fimBaseline));
  }
  const minRaw = new Date(Math.min(...datas.map((d) => d.getTime())));
  const maxRaw = new Date(Math.max(...datas.map((d) => d.getTime())));
  const inicio = startOfMonth(minRaw);
  const fim = endOfMonth(maxRaw);
  const totalDias = differenceInCalendarDays(fim, inicio) + 1;
  const timelineW = totalDias * px;

  const offset = (d: Date) => differenceInCalendarDays(d, inicio) * px;
  const larguraDias = (a: Date, b: Date) => (differenceInCalendarDays(b, a) + 1) * px;

  // Segmentos de mês p/ o cabeçalho.
  const meses: { left: number; width: number; label: string }[] = [];
  let cursor = startOfMonth(inicio);
  while (cursor <= fim) {
    const ini = cursor;
    const fimMes = endOfMonth(cursor);
    meses.push({
      left: offset(ini),
      width: larguraDias(ini, fimMes),
      label: format(ini, "MMM/yy", { locale: ptBR }),
    });
    cursor = addDays(fimMes, 1);
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeOffset = hoje >= inicio && hoje <= fim ? offset(hoje) : null;

  // Caminho crítico (CPM): tarefas com folga 0 ganham destaque na barra.
  const { criticas } = calcularCaminhoCritico(
    tarefas.map((t) => ({
      id: t.id,
      inicioPrevisto: t.inicioPrevisto,
      fimPrevisto: t.fimPrevisto,
      predecessoraIds: t.predecessoraIds,
    })),
  );
  const temCritico = tarefas.some((t) => criticas.has(t.id));

  // Setas de dependência Finish-to-Start: da borda direita do predecessor à borda esquerda da tarefa.
  const taskMeta = new Map(
    tarefas.map((t, idx) => [t.id, { idx, af: parse(t.fimPrevisto) }]),
  );
  const arrows: { d: string; key: string }[] = [];
  tarefas.forEach((task, tIdx) => {
    if (!task.predecessoraIds.length) return;
    const taskY = tIdx * ROW + ROW / 2;
    const taskLeft = LABEL_W + offset(parse(task.inicioPrevisto));
    for (const predId of task.predecessoraIds) {
      const pred = taskMeta.get(predId);
      if (!pred) continue;
      const predY = pred.idx * ROW + ROW / 2;
      const predRight = LABEL_W + offset(pred.af) + px;
      const elbowX = predRight + ARROW_ELBOW;
      arrows.push({
        key: `${predId}->${task.id}`,
        d: `M ${predRight} ${predY} H ${elbowX} V ${taskY} H ${taskLeft}`,
      });
    }
  });

  return (
    <div className="w-full min-w-0 space-y-1.5">
      <div className="w-full min-w-0 overflow-x-auto rounded-sm border">
      <div style={{ width: LABEL_W + timelineW }}>
        {/* Cabeçalho de meses */}
        <div className="flex border-b bg-muted/40" style={{ height: 28 }}>
          <div
            className="shrink-0 border-r px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ width: LABEL_W }}
          >
            Tarefa
          </div>
          <div className="relative" style={{ width: timelineW }}>
            {meses.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-r px-2 py-1 text-[11px] capitalize text-muted-foreground"
                style={{ left: m.left, width: m.width }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {/* Linhas */}
        <div className="relative">
          {hojeOffset != null && (
            <div
              className="pointer-events-none absolute z-10 w-px bg-destructive/70"
              style={{ left: LABEL_W + hojeOffset, top: 0, bottom: 0 }}
              title="Hoje"
            />
          )}
          {/* Setas de dependência (SVG overlay) */}
          {arrows.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 z-20 overflow-visible text-muted-foreground/50"
              style={{ width: LABEL_W + timelineW, height: tarefas.length * ROW }}
            >
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 Z" fill="currentColor" />
                </marker>
              </defs>
              {arrows.map(({ d, key }) => (
                <path
                  key={key}
                  d={d}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  markerEnd="url(#gantt-arrow)"
                />
              ))}
            </svg>
          )}
          {tarefas.map((t) => {
            const ai = parse(t.inicioPrevisto);
            const af = parse(t.fimPrevisto);
            const left = offset(ai);
            const width = Math.max(px, larguraDias(ai, af));
            const bI = t.inicioBaseline ? parse(t.inicioBaseline) : null;
            const bF = t.fimBaseline ? parse(t.fimBaseline) : null;
            const desviado =
              t.fimBaseline != null && differenceInCalendarDays(af, parse(t.fimBaseline)) > 0;
            const critica = criticas.has(t.id);
            return (
              <div key={t.id} className="flex border-b last:border-b-0" style={{ height: ROW }}>
                <button
                  type="button"
                  onClick={() => onSelecionar?.(t.id)}
                  className="flex shrink-0 items-center gap-1 truncate border-r px-3 text-left text-sm hover:bg-muted/50"
                  style={{ width: LABEL_W, paddingLeft: 12 + (t.parentId ? 16 : 0) }}
                  title={critica ? `${t.nome} (caminho crítico)` : t.nome}
                >
                  {t.marco ? (
                    <Flag className="size-3 shrink-0 text-primary" aria-label="Marco" />
                  ) : critica ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                  ) : null}
                  <span className="truncate">{t.nome}</span>
                </button>
                <div className="relative" style={{ width: timelineW }}>
                  {/* barra atual (prevista) com preenchimento de progresso — ou diamante se marco */}
                  {t.marco ? (
                    <div
                      className={`absolute size-3.5 rotate-45 border ${
                        critica ? "border-destructive bg-destructive/60" : "border-primary bg-primary/60"
                      }`}
                      style={{ left: left + px / 2 - 7, top: ROW / 2 - 7 }}
                      title={`Marco: ${t.nome}`}
                    />
                  ) : (
                  <div
                    className={`absolute rounded-sm border ${
                      critica
                        ? "border-destructive ring-1 ring-destructive/60 bg-destructive/20"
                        : "border-primary/40 bg-primary/25"
                    }`}
                    style={{ left, width, top: 6, height: 13 }}
                    title={critica ? "Caminho crítico (folga 0)" : undefined}
                  >
                    <div
                      className={`h-full rounded-l-sm ${critica ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${t.progresso}%` }}
                    />
                  </div>
                  )}
                  {/* barra de linha de base */}
                  {bI && bF && (
                    <div
                      className={`absolute rounded-sm ${desviado ? "bg-destructive/40" : "bg-muted-foreground/30"}`}
                      style={{ left: offset(bI), width: Math.max(px, larguraDias(bI, bF)), top: 22, height: 5 }}
                      title="Linha de base"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      {temCritico && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-3 rounded-sm border border-destructive bg-destructive/20" aria-hidden />
          Caminho crítico (tarefas com folga 0)
        </div>
      )}
    </div>
  );
}
