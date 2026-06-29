/**
 * Sparkline — mini linha de tendência (SVG puro, sem dependência).
 * Recebe uma série de números; desenha a linha normalizada à altura.
 * Decorativo: marcado `aria-hidden` (o valor/contexto fica no card que o usa).
 */
export function Sparkline({
  serie,
  className = "h-8 w-full",
}: {
  serie: number[];
  className?: string;
}) {
  if (serie.length < 2) {
    return <div className={className} aria-hidden />;
  }
  const W = 120;
  const H = 32;
  const max = Math.max(1, ...serie);
  const min = Math.min(0, ...serie);
  const span = max - min || 1;
  const stepX = W / (serie.length - 1);
  const pts = serie.map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`);
  const linha = pts.join(" ");
  const area = `0,${H} ${linha} ${W},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" role="img" aria-hidden>
      <polygon points={area} className="fill-primary/10" />
      <polyline points={linha} fill="none" className="stroke-primary" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
