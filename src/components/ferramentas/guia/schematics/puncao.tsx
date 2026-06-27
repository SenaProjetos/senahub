/**
 * Esquema da punção (vista em planta): pilar c1 × c2, perímetro crítico C'
 * (a 2d, cantos arredondados), força FSd e altura útil d da laje.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function PuncaoSchematic() {
  const cx = 360;
  const cy = 165;
  const c1 = 64; // horizontal (direção do momento)
  const c2 = 64; // vertical
  const off = 44; // ~2d

  const colX = cx - c1 / 2;
  const colY = cy - c2 / 2;

  return (
    <Schematic viewBox="0 0 720 300">
      {/* perímetro crítico C' (2d) */}
      <rect
        x={colX - off}
        y={colY - off}
        width={c1 + 2 * off}
        height={c2 + 2 * off}
        rx={off}
        className="fill-none stroke-primary"
        strokeWidth={1.3}
        strokeDasharray="6 4"
      />
      <Tag x={cx} y={colY - off - 12} muted size={11}>
        C′ (perímetro crítico, 2d)
      </Tag>

      {/* pilar */}
      <rect x={colX} y={colY} width={c1} height={c2} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* FSd */}
      <line x1={cx} y1={colY - off - 36} x2={cx} y2={colY} className="stroke-primary" strokeWidth={1.7} markerEnd="url(#gf-arrow)" />
      <Tag x={cx + 8} y={colY - off - 34} anchor="start" muted size={12} italic>
        FSd
      </Tag>

      {/* cotas */}
      <Dim x1={colX} y1={colY + c2 + 16} x2={colX + c1} y2={colY + c2 + 16} label="c1" />
      <Dim x1={colX + c1 + 16} y1={colY} x2={colX + c1 + 16} y2={colY + c2} label="c2" />
      <Tag x={cx} y={272} muted size={11}>
        d = altura útil da laje
      </Tag>

      {/* badges */}
      <Connector x1={245} y1={100} x2={colX - off + 6} y2={colY - off + 14} />
      <Anchor x={233} y={96} n={1} />
      <Connector x1={452} y1={cy} x2={colX + c1 + 30} y2={cy} />
      <Anchor x={464} y={cy} n={2} />
      <Connector x1={440} y1={68} x2={cx + 6} y2={74} />
      <Anchor x={452} y={64} n={3} />
      <Connector x1={245} y1={232} x2={colX - off + 8} y2={colY + c2 + off - 12} />
      <Anchor x={233} y={236} n={4} />
    </Schematic>
  );
}
