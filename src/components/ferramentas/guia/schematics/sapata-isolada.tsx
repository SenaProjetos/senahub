/**
 * Esquema da sapata isolada (corte/elevação frontal): pilar sobre a sapata
 * (trapézio), carga Nk no topo, reação do solo (σ) na base e cotas B (base)
 * e h (altura). Os badges ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function FootingSchematic() {
  const cx = 360;
  // Pilar
  const colW = 58;
  const colX = cx - colW / 2;
  const colTop = 86;
  // Sapata (trapézio)
  const topY = 186;
  const botY = 232;
  const topHalf = 66;
  const botHalf = 152;
  const bx1 = cx - botHalf;
  const bx2 = cx + botHalf;

  const trap = [
    [cx - topHalf, topY],
    [cx + topHalf, topY],
    [bx2, botY],
    [bx1, botY],
  ]
    .map((p) => p.join(","))
    .join(" ");

  return (
    <Schematic viewBox="0 0 720 300">
      {/* carga Nk */}
      <line x1={cx} y1={44} x2={cx} y2={colTop - 4} className="stroke-primary" strokeWidth={1.8} markerEnd="url(#gf-arrow)" />
      <Tag x={cx} y={36} muted size={12} italic>
        Nk
      </Tag>

      {/* pilar */}
      <rect x={colX} y={colTop} width={colW} height={topY - colTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      <Dim x1={colX} y1={colTop - 14} x2={colX + colW} y2={colTop - 14} label="ap" />

      {/* sapata */}
      <polygon points={trap} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* solo: linha de terreno + reação σ */}
      <line x1={bx1 - 28} y1={botY} x2={bx2 + 28} y2={botY} className="stroke-foreground/70" strokeWidth={1} />
      <g className="stroke-primary" strokeWidth={1.3}>
        {Array.from({ length: 7 }, (_, i) => bx1 + 22 + i * ((bx2 - bx1 - 44) / 6)).map((x, i) => (
          <line key={i} x1={x} y1={botY + 28} x2={x} y2={botY + 3} markerEnd="url(#gf-arrow)" />
        ))}
      </g>
      <Tag x={cx} y={botY + 42} muted size={11} italic>
        σ (reação do solo)
      </Tag>

      {/* cotas */}
      <Dim x1={bx1} y1={botY + 58} x2={bx2} y2={botY + 58} label="B" />
      <Dim x1={bx2 + 18} y1={topY} x2={bx2 + 18} y2={botY} label="h" />

      {/* badges → grupos do formulário */}
      {/* 1. Carga (Nk) */}
      <Connector x1={430} y1={50} x2={366} y2={62} />
      <Anchor x={442} y={46} n={1} />
      {/* 2. Solo (σadm) */}
      <Connector x1={162} y1={258} x2={206} y2={250} />
      <Anchor x={150} y={258} n={2} />
      {/* 3. Pilar (ap, bp) */}
      <Connector x1={262} y1={128} x2={colX - 2} y2={128} />
      <Anchor x={250} y={128} n={3} />
      {/* 4. Sapata e materiais */}
      <Connector x1={578} y1={206} x2={466} y2={206} />
      <Anchor x={590} y={206} n={4} />
    </Schematic>
  );
}
