type Ponto = { rotulo: string; valor: number };

/** Linha de tendência (SVG puro, sem dependência) do índice de retrabalho mensal. */
export function TrendLine({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Tendência aparece a partir de 2 snapshots mensais.
      </p>
    );
  }

  const W = 560;
  const H = 160;
  const PAD = { top: 12, right: 12, bottom: 24, left: 30 };
  const maxV = Math.max(10, ...pontos.map((p) => p.valor)) * 1.1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (pontos.length === 1 ? innerW / 2 : (i / (pontos.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxV) * innerH;

  const linha = pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${linha} ${x(pontos.length - 1)},${PAD.top + innerH}`;
  const ticks = [0, maxV / 2, maxV];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Tendência do índice">
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text x={4} y={y(t) + 3} className="fill-muted-foreground font-mono text-[8px]">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <polygon points={area} className="fill-primary/10" />
      <polyline
        points={linha}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.valor)} r={2.5} className="fill-primary" />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">
            {p.rotulo}
          </text>
        </g>
      ))}
    </svg>
  );
}
