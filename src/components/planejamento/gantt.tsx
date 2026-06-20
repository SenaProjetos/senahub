import { differenceInCalendarDays, addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ListChecks } from "lucide-react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { EmptyState } from "@/components/ui/empty-state";

export const GANTT_PX_DEFAULT = 18; // pixels por dia
const ROW = 34; // altura da linha (px)
const LABEL_W = 220;

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

  return (
    <div className="overflow-x-auto rounded-sm border">
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
          {tarefas.map((t) => {
            const ai = parse(t.inicioPrevisto);
            const af = parse(t.fimPrevisto);
            const left = offset(ai);
            const width = Math.max(px, larguraDias(ai, af));
            const bI = t.inicioBaseline ? parse(t.inicioBaseline) : null;
            const bF = t.fimBaseline ? parse(t.fimBaseline) : null;
            const desviado =
              t.fimBaseline != null && differenceInCalendarDays(af, parse(t.fimBaseline)) > 0;
            return (
              <div key={t.id} className="flex border-b last:border-b-0" style={{ height: ROW }}>
                <button
                  type="button"
                  onClick={() => onSelecionar?.(t.id)}
                  className="flex shrink-0 items-center gap-1 truncate border-r px-3 text-left text-sm hover:bg-muted/50"
                  style={{ width: LABEL_W, paddingLeft: 12 + (t.parentId ? 16 : 0) }}
                  title={t.nome}
                >
                  <span className="truncate">{t.nome}</span>
                </button>
                <div className="relative" style={{ width: timelineW }}>
                  {/* barra atual (prevista) com preenchimento de progresso */}
                  <div
                    className="absolute rounded-sm border border-primary/40 bg-primary/25"
                    style={{ left, width, top: 6, height: 13 }}
                  >
                    <div
                      className="h-full rounded-l-sm bg-primary"
                      style={{ width: `${t.progresso}%` }}
                    />
                  </div>
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
  );
}
