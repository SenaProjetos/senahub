/**
 * Esquema das propriedades de seção: uma seção genérica (retangular) com o
 * centroide (CG), os eixos baricêntricos x–y e as cotas b e h. Ilustra A, I, W
 * e raios de giração. Os badges ligam o desenho aos grupos de campos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function SectionPropertiesSchematic() {
  const x1 = 250;
  const x2 = 470;
  const y1 = 60;
  const y2 = 200;
  const cgx = (x1 + x2) / 2;
  const cgy = (y1 + y2) / 2;

  return (
    <Schematic viewBox="0 0 720 260">
      {/* seção */}
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* eixos baricêntricos */}
      <line x1={x1 - 30} y1={cgy} x2={x2 + 30} y2={cgy} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="5 3" />
      <line x1={cgx} y1={y1 - 26} x2={cgx} y2={y2 + 30} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="5 3" />
      <Tag x={x2 + 36} y={cgy} anchor="start" muted size={12} italic>
        x
      </Tag>
      <Tag x={cgx} y={y1 - 32} muted size={12} italic>
        y
      </Tag>

      {/* centroide */}
      <circle cx={cgx} cy={cgy} r={3.5} className="fill-foreground" />
      <Tag x={cgx + 12} y={cgy + 14} anchor="start" muted size={11}>
        CG
      </Tag>

      {/* cotas */}
      <Dim x1={x1} y1={y2 + 18} x2={x2} y2={y2 + 18} label="b" />
      <Dim x1={x2 + 18} y1={y1} x2={x2 + 18} y2={y2} label="h" />

      {/* badges → grupos do formulário */}
      {/* 1. Tipo de seção */}
      <Connector x1={212} y1={86} x2={x1 - 2} y2={90} />
      <Anchor x={200} y={84} n={1} />
      {/* 2. Dimensões */}
      <Connector x1={cgx} y1={y2 + 30} x2={cgx} y2={y2 + 22} />
      <Anchor x={cgx} y={y2 + 42} n={2} />
    </Schematic>
  );
}
