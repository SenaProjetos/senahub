const CX = 80;
const CY = 72;
const R = 54;
const STROKE = 11;

// Maps a math-angle (0=right, 90=up, 180=left) to SVG screen coords (y-down).
function pt(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

// Semi-circular arc going CCW (sweep=0 in SVG) from math 180° (left) to math 0° (right) — top arch.
// At pct% of the arc: math angle = 180 - pct * 1.8
function fgPath(pct: number) {
  const capped = Math.min(100, Math.max(0.1, pct));
  const end = pt(180 - capped * 1.8);
  // Arc is always ≤180° and CCW → large=0, sweep=0
  return `M ${pt(180).x} ${pt(180).y} A ${R} ${R} 0 0 0 ${end.x} ${end.y}`;
}

// Full background arc (left → right, top arch).
const bgPath = `M ${pt(180).x} ${pt(180).y} A ${R} ${R} 0 0 0 ${pt(0).x} ${pt(0).y}`;

// Zone tick at a given pct mark (short radial line).
function tick(pct: number) {
  const a = 180 - pct * 1.8;
  const rad = (a * Math.PI) / 180;
  const inner = { x: CX + (R - 7) * Math.cos(rad), y: CY - (R - 7) * Math.sin(rad) };
  const outer = { x: CX + (R + 3) * Math.cos(rad), y: CY - (R + 3) * Math.sin(rad) };
  return `M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`;
}

export function IndiceGauge({ indice }: { indice: number }) {
  const color =
    indice > 30
      ? "hsl(var(--destructive))"
      : indice > 15
        ? "hsl(var(--warning))"
        : "hsl(var(--success))";

  return (
    <svg viewBox="0 0 160 88" className="w-full max-w-[180px]" aria-hidden>
      {/* faixa de fundo */}
      <path d={bgPath} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE} strokeLinecap="round" />
      {/* faixa de valor */}
      {indice > 0 && (
        <path d={fgPath(indice)} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      )}
      {/* ticks de zona: 15% e 30% */}
      <path d={tick(15)} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.5" />
      <path d={tick(30)} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.5" />
      {/* rótulos de zona */}
      <text x={pt(180 - 15 * 1.8).x - 4} y={pt(180 - 15 * 1.8).y - 8} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle" opacity="0.7">15</text>
      <text x={pt(180 - 30 * 1.8).x + 4} y={pt(180 - 30 * 1.8).y - 8} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle" opacity="0.7">30</text>
      {/* extremos */}
      <text x={pt(180).x - 4} y={pt(180).y + 14} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle" opacity="0.7">0</text>
      <text x={pt(0).x + 4} y={pt(0).y + 14} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle" opacity="0.7">100</text>
    </svg>
  );
}
