import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/modules/acessos/labels";
import type { StatusCredencial } from "@/modules/acessos/service";

export type ContagemStatus = Record<StatusCredencial, number>;

/**
 * Resumo por status — donut em SVG puro.
 *
 * Sem biblioteca de gráfico: nada em `package.json` desenha charts hoje e §94 proíbe instalar
 * uma para esta tela. `stroke-dasharray` sobre um círculo resolve um donut de 5 fatias em ~20
 * linhas; o `Sparkline` do sistema já usa a mesma abordagem.
 *
 * O gráfico é `aria-hidden`: a legenda ao lado já dá rótulo, valor e porcentagem em texto, e um
 * SVG com role="img" só repetiria isso pior no leitor de tela (§60 — não depender da cor).
 */
const COR: Record<StatusCredencial, string> = {
  ativo: "var(--color-success)",
  expirando: "var(--color-warning)",
  atencao: "var(--color-warning)",
  bloqueado: "var(--color-destructive)",
  inativo: "var(--color-muted-foreground)",
};

const ORDEM: StatusCredencial[] = ["ativo", "expirando", "atencao", "bloqueado", "inativo"];

const RAIO = 42;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

export function ResumoStatus({ contagem }: { contagem: ContagemStatus }) {
  const total = ORDEM.reduce((s, k) => s + (contagem[k] ?? 0), 0);
  if (total === 0) return null;

  // Cada fatia é um arco: comprimento proporcional, deslocado pela soma das anteriores.
  let acumulado = 0;
  const fatias = ORDEM.filter((k) => (contagem[k] ?? 0) > 0).map((k) => {
    const valor = contagem[k] ?? 0;
    const fracao = valor / total;
    const fatia = {
      chave: k,
      valor,
      pct: Math.round(fracao * 100),
      comprimento: fracao * CIRCUNFERENCIA,
      deslocamento: -acumulado * CIRCUNFERENCIA,
    };
    acumulado += fracao;
    return fatia;
  });

  return (
    <section aria-labelledby="resumo-status" className="rounded-lg border bg-card p-3">
      <h2
        id="resumo-status"
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        Resumo por status
      </h2>

      <div className="flex justify-center">
        <svg viewBox="0 0 100 100" className="size-32 -rotate-90" aria-hidden>
          {fatias.map((f) => (
            <circle
              key={f.chave}
              cx="50"
              cy="50"
              r={RAIO}
              fill="none"
              stroke={COR[f.chave]}
              strokeWidth="14"
              strokeDasharray={`${f.comprimento} ${CIRCUNFERENCIA - f.comprimento}`}
              strokeDashoffset={f.deslocamento}
            />
          ))}
        </svg>
      </div>

      <ul className="mt-3 space-y-1.5">
        {fatias.map((f) => (
          <li key={f.chave} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: COR[f.chave] }}
              aria-hidden
            />
            <span className="flex-1 truncate">{STATUS_LABEL[f.chave]}</span>
            <span className="tabular-nums text-muted-foreground">
              {f.valor} ({f.pct}%)
            </span>
          </li>
        ))}
      </ul>

      <div className={cn("mt-3 flex items-center justify-between border-t pt-2 text-xs font-medium")}>
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </section>
  );
}
