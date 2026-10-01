import { cn } from "@/lib/utils";

/**
 * Barra de progresso (div, sem Radix/base-ui): existia em 3 cópias inline (orçamento, aging,
 * carteira). `valor` de 0 a 100; fora disso é preso. O texto alternativo é obrigatório: a barra
 * sozinha não diz o quê nem quanto.
 */
export function Progress({
  valor,
  rotulo,
  tom = "primario",
  className,
}: {
  valor: number;
  /** Lido por leitor de tela ("Salários: 89% da necessidade"). */
  rotulo: string;
  tom?: "primario" | "sucesso" | "alerta" | "perigo";
  className?: string;
}) {
  const pct = Number.isFinite(valor) ? Math.min(100, Math.max(0, valor)) : 0;
  const cor = {
    primario: "bg-primary",
    sucesso: "bg-success",
    alerta: "bg-warning",
    perigo: "bg-destructive",
  }[tom];
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2 overflow-hidden rounded-sm bg-muted", className)}
    >
      <div className={cn("h-full", cor)} style={{ width: `${pct}%` }} />
    </div>
  );
}
