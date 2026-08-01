type Ponto = { rotulo: string; valor: number; tooltip?: string };

const MAX_ROTULOS = 8;

/**
 * Linha de tendência (SVG puro, sem dependência).
 * `unidade` é o sufixo do eixo Y (ex.: "%" → "11%"); vazio para contagens (projetos, acessos).
 * `minEixo`/`maxEixo` sobrescrevem a escala automática — útil para domínios fixos (ex.: humor 1-5).
 * Rótulos do eixo X são desbastados (no máx. `MAX_ROTULOS`) pra não sobrepor; o ponto sempre
 * carrega `tooltip` (ou `rotulo`) num `<title>` nativo, então a data completa some no hover
 * mesmo quando o rótulo visível está abreviado ou oculto.
 */
export function TrendLine({
  pontos,
  unidade = "",
  descricao = "Linha de tendência",
  minEixo = 0,
  maxEixo,
}: {
  pontos: Ponto[];
  unidade?: string;
  descricao?: string;
  minEixo?: number;
  maxEixo?: number;
}) {
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
  const maxV = maxEixo ?? Math.max(10, ...pontos.map((p) => p.valor)) * 1.1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (pontos.length === 1 ? innerW / 2 : (i / (pontos.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - minEixo) / (maxV - minEixo)) * innerH;

  const linha = pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${linha} ${x(pontos.length - 1)},${PAD.top + innerH}`;
  const ticks = [minEixo, (minEixo + maxV) / 2, maxV];
  const passoRotulo = Math.max(1, Math.ceil(pontos.length / MAX_ROTULOS));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={descricao}>
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
            {Math.round(t)}{unidade}
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
      {pontos.map((p, i) => {
        const mostraRotulo = i % passoRotulo === 0 || i === pontos.length - 1;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.valor)} r={8} fill="transparent">
              <title>{`${p.tooltip ?? p.rotulo}: ${p.valor}${unidade}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(p.valor)} r={2.5} className="fill-primary" pointerEvents="none" />
            {mostraRotulo && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">
                {p.rotulo}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
