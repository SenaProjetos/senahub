import { brl } from "@/lib/utils";

interface MargemDonutProps {
  receitaConfirmada: number;
  despesaDireta: number;
  custoHoras: number;
  margem: number;
  margemPct: number | null;
}

function DonutArc({
  cx,
  cy,
  r,
  startAngle,
  endAngle,
  className,
}: {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  className?: string;
}) {
  if (Math.abs(endAngle - startAngle) < 0.001) return null;

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;

  return (
    <path
      d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
      className={className}
      fill="none"
      strokeWidth={18}
      strokeLinecap="round"
    />
  );
}

export function MargemDonut({
  receitaConfirmada,
  despesaDireta,
  custoHoras,
  margem,
  margemPct,
}: MargemDonutProps) {
  const totalDespesa = despesaDireta + custoHoras;
  const total = receitaConfirmada || 1; // evita div/0

  // Proporções em graus (360° = receita total confirmada).
  const despesaDeg = Math.min(360, (totalDespesa / total) * 360);
  const margemDeg = Math.max(0, 360 - despesaDeg);

  const cx = 60;
  const cy = 60;
  const r = 44;

  const positiva = margem >= 0;

  return (
    <div className="flex items-center gap-6">
      {/* SVG donut */}
      <div className="shrink-0">
        <svg width={120} height={120} viewBox="0 0 120 120" aria-hidden>
          {/* Fundo */}
          <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-muted" strokeWidth={18} />
          {/* Despesa */}
          {despesaDeg > 0 && (
            <DonutArc
              cx={cx}
              cy={cy}
              r={r}
              startAngle={0}
              endAngle={despesaDeg}
              className="stroke-destructive"
            />
          )}
          {/* Margem */}
          {margemDeg > 0 && (
            <DonutArc
              cx={cx}
              cy={cy}
              r={r}
              startAngle={despesaDeg}
              endAngle={360}
              className={positiva ? "stroke-success" : "stroke-warning"}
            />
          )}
          {/* Texto central */}
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-[13px] font-bold"
            style={{ fontSize: 13, fontWeight: 700 }}
          >
            {margemPct != null ? `${margemPct.toFixed(0)}%` : "—"}
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 9 }}
          >
            margem
          </text>
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-success shrink-0" />
          <span className="text-muted-foreground">Receita confirmada</span>
          <span className="ml-auto font-mono">{brl(receitaConfirmada)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-destructive shrink-0" />
          <span className="text-muted-foreground">Despesas diretas</span>
          <span className="ml-auto font-mono">{brl(despesaDireta)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-destructive/60 shrink-0" />
          <span className="text-muted-foreground">Custo de horas</span>
          <span className="ml-auto font-mono">{brl(custoHoras)}</span>
        </div>
        <div className="flex items-center gap-2 border-t pt-2">
          <span
            className={`size-2.5 rounded-full shrink-0 ${positiva ? "bg-success" : "bg-warning"}`}
          />
          <span className="font-medium">Margem realizada</span>
          <span className={`ml-auto font-mono font-bold ${positiva ? "text-success" : "text-warning"}`}>
            {brl(margem)}
          </span>
        </div>
      </div>
    </div>
  );
}
