/**
 * Esquema do resumo de aço: um conjunto de barras de mesma bitola (ø), com o
 * comprimento e uma dobra (corte e dobra); o peso total recebe um acréscimo de
 * perda. Os badges ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function SteelSummarySchematic() {
  const bx1 = 160;
  const bx2 = 500;

  return (
    <Schematic viewBox="0 0 720 210">
      {/* barras (quantidade) */}
      <g className="fill-none stroke-foreground" strokeWidth={3}>
        <path d={`M ${bx1} 96 L ${bx2} 96 L ${bx2} 116`} />
        <line x1={bx1} y1={112} x2={bx2} y2={112} />
        <line x1={bx1} y1={128} x2={bx2} y2={128} />
      </g>
      <Tag x={bx1 - 12} y={112} anchor="end" muted size={12} italic>
        ø
      </Tag>
      <Tag x={bx1} y={78} anchor="start" muted size={11}>
        n barras
      </Tag>

      {/* comprimento */}
      <Dim x1={bx1} y1={160} x2={bx2} y2={160} label="comprimento" />

      {/* badges → grupos do formulário */}
      {/* 1. Barras */}
      <Connector x1={578} y1={112} x2={bx2 + 2} y2={112} />
      <Anchor x={590} y={112} n={1} />
      {/* 2. Perdas */}
      <Connector x1={162} y1={190} x2={176} y2={190} />
      <Anchor x={150} y={190} n={2} />
      <Tag x={186} y={190} anchor="start" muted size={11}>
        perda (%) sobre o peso total
      </Tag>
    </Schematic>
  );
}
