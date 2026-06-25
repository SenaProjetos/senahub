/**
 * Esquema do pilar de concreto: elevação (carga Nd + comprimento de
 * flambagem) + seção transversal cotada (b, h, d') com armadura nos cantos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function PilarSchematic() {
  // Elevação (esquerda)
  const ex = 96;
  const ew = 56;
  const eTop = 48;
  const eBot = 250;
  const eMid = ex + ew / 2;

  // Seção (direita)
  const sx = 472;
  const sw = 92; // b
  const sy = 74;
  const sh = 132; // h
  const sx2 = sx + sw;
  const sy2 = sy + sh;
  const inset = 14;

  return (
    <Schematic viewBox="0 0 720 300">
      {/* ===== Elevação ===== */}
      <line x1={eMid} y1={16} x2={eMid} y2={eTop} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={eMid} y={9} muted size={12} italic>
        Nd
      </Tag>
      <rect x={ex} y={eTop} width={ew} height={eBot - eTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      {/* base engastada */}
      <line x1={ex - 16} y1={eBot} x2={ex + ew + 16} y2={eBot} className="stroke-foreground/70" strokeWidth={1} />
      {[-2, -1, 0, 1, 2].map((k) => (
        <line key={k} x1={eMid + k * 12 - 6} y1={eBot + 8} x2={eMid + k * 12} y2={eBot} className="stroke-foreground/70" strokeWidth={1} />
      ))}
      <Dim x1={ex - 26} y1={eTop} x2={ex - 26} y2={eBot} label="ℓe" />
      <Tag x={eMid} y={eBot + 26} muted size={11}>
        Elevação
      </Tag>

      <Connector x1={eMid + 60} y1={30} x2={eMid + 8} y2={30} />
      <Anchor x={eMid + 72} y={30} n={3} />
      <Connector x1={ex - 52} y1={150} x2={ex - 30} y2={150} />
      <Anchor x={ex - 64} y={150} n={4} />

      {/* ===== Seção transversal ===== */}
      <rect x={sx} y={sy} width={sw} height={sh} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      {/* estribo */}
      <rect x={sx + 7} y={sy + 7} width={sw - 14} height={sh - 14} className="fill-none stroke-foreground/45" strokeWidth={1} rx={3} />
      {/* barras nos cantos */}
      {[
        [sx + inset, sy + inset],
        [sx2 - inset, sy + inset],
        [sx + inset, sy2 - inset],
        [sx2 - inset, sy2 - inset],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={4} className="fill-foreground" />
      ))}
      <Dim x1={sx - 14} y1={sy} x2={sx - 14} y2={sy + inset} label="d'" />
      <Dim x1={sx} y1={sy2 + 16} x2={sx2} y2={sy2 + 16} label="b" />
      <Dim x1={sx2 + 16} y1={sy} x2={sx2 + 16} y2={sy2} label="h" />
      <Tag x={sx + sw / 2} y={sy - 18} muted size={11}>
        Seção transversal
      </Tag>

      <Connector x1={sx + sw / 2} y1={sy2 + 32} x2={sx + sw / 2} y2={sy2 + 8} />
      <Anchor x={sx + sw / 2} y={sy2 + 44} n={1} />
      <Connector x1={sx - 52} y1={sy + sh / 2} x2={sx - 6} y2={sy + sh / 2} />
      <Anchor x={sx - 64} y={sy + sh / 2} n={2} />
    </Schematic>
  );
}
