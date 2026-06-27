/**
 * Esquema das combinações de ações: uma viga recebendo a ação permanente (G,
 * distribuída) e uma ação variável (Q), combinadas com seus coeficientes na
 * força de cálculo (Fd). Os badges ligam o desenho aos grupos de campos.
 */

import { Schematic, LoadArrows, SupportPin, SupportRoller, Anchor, Connector, Tag } from "../schematic-kit";

export function ActionCombosSchematic() {
  const bx1 = 170;
  const bx2 = 530;
  const beamY = 150;

  return (
    <Schematic viewBox="0 0 720 260">
      {/* ação variável Q */}
      <line x1={440} y1={72} x2={440} y2={106} className="stroke-primary" strokeWidth={2} markerEnd="url(#gf-arrow)" />
      <Tag x={448} y={66} anchor="start" muted size={11} italic>
        Q (variável)
      </Tag>

      {/* ação permanente G (distribuída) */}
      <LoadArrows x1={bx1 + 8} x2={bx2 - 8} y={116} depth={24} n={10} />
      <Tag x={bx1} y={108} anchor="start" muted size={11} italic>
        G (permanente)
      </Tag>

      {/* viga */}
      <rect x={bx1} y={beamY} width={bx2 - bx1} height={16} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      <SupportPin x={bx1} y={beamY + 16} />
      <SupportRoller x={bx2} y={beamY + 16} />

      {/* combinação */}
      <rect x={200} y={198} width={320} height={36} rx={6} className="fill-primary/10 stroke-primary" strokeWidth={1.1} />
      <Tag x={360} y={216} muted size={11}>
        Fd = γg·G + γq·Q1 + Σ ψ0·Qi
      </Tag>

      {/* badges → grupos do formulário */}
      {/* 1. Ações permanentes (G) */}
      <Connector x1={162} y1={116} x2={bx1 + 6} y2={116} />
      <Anchor x={150} y={116} n={1} />
      {/* 2. Ações variáveis (Q) */}
      <Connector x1={474} y1={86} x2={442} y2={84} />
      <Anchor x={486} y={86} n={2} />
    </Schematic>
  );
}
