import { Receipt } from "lucide-react";
import type { FatiaCategoria } from "@/modules/financeiro/relatorios/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

// Tokens do tema (claro e escuro); o que passa de 5 fatias cai em tons neutros.
const CORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)", "var(--border)"];

/** Rosca de distribuição (SVG, sem dependência). Ex.: despesas por categoria. */
export function CategoriaDonutChart({ dados, total }: { dados: FatiaCategoria[]; total: number }) {
  if (total <= 0 || dados.length === 0) {
    return <EmptyState icon={Receipt} title="Sem despesas confirmadas no período." />;
  }

  const resumo = dados
    .slice(0, 5)
    .map((f) => `${f.nome} ${((f.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`)
    .join(", ");
  const r = 15.915; // circunferência = 100 (facilita dasharray em %)
  const C = 2 * Math.PI * r;
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 40 40" className="size-32 shrink-0 -rotate-90" role="img" aria-label={`Distribuição por categoria, total ${brl(total)}: ${resumo}. A lista ao lado traz todos os valores.`}>
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
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: CORES[i % CORES.length] }} />
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
