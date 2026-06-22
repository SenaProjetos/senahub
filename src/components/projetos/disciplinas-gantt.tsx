import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/modules/projetos/status";
import type { StatusDisciplina } from "@/generated/prisma/client";

interface DisciplinaGantt {
  id: string;
  nome: string;
  status: StatusDisciplina;
  prazo: string | null;
}

const STATUS_BAR_CLASS: Record<StatusDisciplina, string> = {
  aguardando: "bg-muted-foreground/40",
  em_andamento: "bg-status-andamento",
  em_revisao: "bg-status-revisao",
  entregue: "bg-status-entregue",
  aprovado: "bg-status-aprovado",
};

function addDaysStr(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function DisciplinasGantt({ disciplinas }: { disciplinas: DisciplinaGantt[] }) {
  const comPrazo = disciplinas.filter((d) => d.prazo != null);
  if (comPrazo.length === 0) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Janela da timeline: 30 dias antes do prazo mais próximo até 14 dias após o mais distante.
  const datas = comPrazo.map((d) => new Date(d.prazo!).getTime());
  const minTs = Math.min(...datas);
  const maxTs = Math.max(...datas);

  const inicio = addDaysStr(new Date(minTs), -30);
  inicio.setHours(0, 0, 0, 0);
  const fim = addDaysStr(new Date(maxTs), 14);
  fim.setHours(0, 0, 0, 0);

  const totalMs = fim.getTime() - inicio.getTime();
  if (totalMs <= 0) return null;

  const pct = (ts: number) =>
    Math.max(0, Math.min(100, ((ts - inicio.getTime()) / totalMs) * 100));

  const hojeLeft = pct(hoje.getTime());

  return (
    <div className="overflow-x-auto">
      {/* Cabeçalho de datas */}
      <div className="relative mb-1 ml-36 h-5 text-[10px] text-muted-foreground">
        <span className="absolute" style={{ left: 0 }}>
          {fmtShort(inicio)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${hojeLeft}%` }}>
          hoje
        </span>
        <span className="absolute -translate-x-full" style={{ left: "100%" }}>
          {fmtShort(fim)}
        </span>
      </div>

      <div className="space-y-1.5">
        {comPrazo.map((d) => {
          const prazoTs = new Date(d.prazo!).getTime();
          const barRight = pct(prazoTs);
          // Barra começa em hojeLeft ou 0, termina no prazo.
          const barLeft = Math.min(hojeLeft, barRight);
          const barWidth = Math.max(0, barRight - barLeft);
          const vencido = prazoTs < hoje.getTime() && d.status !== "aprovado";

          return (
            <div key={d.id} className="flex items-center gap-2">
              {/* Label */}
              <span className="w-36 shrink-0 truncate text-right text-xs text-muted-foreground">
                {d.nome}
              </span>
              {/* Track */}
              <div className="relative h-5 flex-1 rounded bg-muted">
                {/* Barra de progresso até o prazo */}
                <div
                  className={cn(
                    "absolute top-1 h-3 rounded",
                    STATUS_BAR_CLASS[d.status],
                    vencido && "opacity-60",
                  )}
                  style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                  title={`${STATUS_LABEL[d.status]} · prazo ${fmtShort(new Date(d.prazo!))}`}
                />
                {/* Marcador de prazo */}
                <div
                  className={cn(
                    "absolute top-0 h-5 w-0.5",
                    vencido ? "bg-destructive" : "bg-foreground/50",
                  )}
                  style={{ left: `${barRight}%` }}
                />
                {/* Linha de hoje */}
                <div
                  className="absolute top-0 h-5 w-px bg-primary/60"
                  style={{ left: `${hojeLeft}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
