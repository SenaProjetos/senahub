/**
 * Esquema da ancoragem de barra: barra de aço embutida num bloco de concreto,
 * com o comprimento de ancoragem (lb) e um gancho na extremidade. Os badges
 * ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function AnchorageSchematic() {
  const blkX1 = 140;
  const blkX2 = 520;
  const blkTop = 70;
  const blkBot = 180;
  const barY = 125;
  const hookX = 200;
  const hookTop = 92;

  return (
    <Schematic viewBox="0 0 720 240">
      {/* bloco de concreto */}
      <rect x={blkX1} y={blkTop} width={blkX2 - blkX1} height={blkBot - blkTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      <Tag x={(blkX1 + blkX2) / 2} y={blkTop - 12} muted size={11}>
        Concreto (fck) — aderência
      </Tag>

      {/* barra com gancho */}
      <path d={`M 588 ${barY} L ${hookX} ${barY} L ${hookX} ${hookTop}`} className="fill-none stroke-foreground" strokeWidth={3} />
      <Tag x={596} y={barY - 12} anchor="start" muted size={12} italic>
        ø
      </Tag>
      <Tag x={hookX - 12} y={hookTop - 2} anchor="end" muted size={11}>
        gancho
      </Tag>

      {/* comprimento de ancoragem */}
      <Dim x1={hookX} y1={blkBot + 22} x2={blkX2} y2={blkBot + 22} label="lb" />

      {/* badges → grupos do formulário */}
      {/* 1. Barra (ø, aço) */}
      <Connector x1={600} y1={barY} x2={586} y2={barY} />
      <Anchor x={612} y={barY} n={1} />
      {/* 2. Concreto e aderência */}
      <Connector x1={330} y1={54} x2={330} y2={blkTop - 2} />
      <Anchor x={330} y={42} n={2} />
      {/* 3. Ancoragem (gancho, traspasse) */}
      <Connector x1={122} y1={hookTop} x2={hookX - 4} y2={hookTop} />
      <Anchor x={110} y={hookTop} n={3} />
    </Schematic>
  );
}
