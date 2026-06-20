import type { FatiaCategoria } from "@/modules/financeiro/relatorios/queries";
import { brl } from "@/lib/utils";

const CORES = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#94a3b8"];

/** Rosca de distribuição (SVG, sem dependência). Ex.: despesas por categoria. */
export function CategoriaDonutChart({ dados, total }: { dados: FatiaCategoria[]; total: number }) {
  if (total <= 0 || dados.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem despesas confirmadas no período.</p>;
  }

  const r = 15.915; // circunferência = 100 (facilita dasharray em %)
  const C = 2 * Math.PI * r;
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 40 40" className="size-32 shrink-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" className="stroke-muted" strokeWidth={5} />
        {dados.map((f, i) => {
          const frac = f.valor / total;
          const len = frac * C;
          const seg = (
            <circle
              key={f.nome}
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke={CORES[i % CORES.length]}
              strokeWidth={5}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-acumulado}
            />
          );
          acumulado += len;
          return seg;
        })}
      </svg>
      <ul className="w-full space-y-1 text-sm">
        {dados.map((f, i) => (
          <li key={f.nome} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: CORES[i % CORES.length] }} />
            <span className="flex-1 truncate">{f.nome}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {((f.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
            </span>
            <span className="w-24 text-right font-mono text-xs">{brl(f.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
