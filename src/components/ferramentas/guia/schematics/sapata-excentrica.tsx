/**
 * Esquema da sapata excêntrica (corte/elevação frontal): pilar deslocado do
 * centro da sapata (excentricidade e), carga Nk + momento Mk e diagrama
 * trapezoidal de tensões no solo (σmax/σmin). Serve aos dois modos do
 * formulário (isolada e divisa com viga de equilíbrio).
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function EccentricFootingSchematic() {
  const cxF = 360; // centro da sapata
  const cxCol = 300; // centro do pilar (deslocado)
  const fx1 = 190;
  const fx2 = 530;
  const fTop = 176;
  const fBot = 206;
  const colW = 50;
  const colTop = 110;

  // borda inferior do diagrama de tensões (trapézio)
  const edge = (x: number) => 262 - 40 * ((x - fx1) / (fx2 - fx1));

  return (
    <Schematic viewBox="0 0 720 300">
      {/* carga Nk + momento Mk */}
      <line x1={cxCol} y1={68} x2={cxCol} y2={colTop - 4} className="stroke-primary" strokeWidth={1.8} markerEnd="url(#gf-arrow)" />
      <Tag x={cxCol} y={60} muted size={12} italic>
        Nk
      </Tag>
      <path d={`M ${cxCol - 30} 100 Q ${cxCol} 70 ${cxCol + 30} 100`} className="fill-none stroke-primary" strokeWidth={1.5} markerEnd="url(#gf-arrow)" />
      <Tag x={cxCol + 38} y={92} anchor="start" muted size={12} italic>
        Mk
      </Tag>

      {/* pilar deslocado */}
      <rect x={cxCol - colW / 2} y={colTop} width={colW} height={fTop - colTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* sapata */}
      <rect x={fx1} y={fTop} width={fx2 - fx1} height={fBot - fTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* eixo da sapata + excentricidade e */}
      <line x1={cxF} y1={146} x2={cxF} y2={fBot + 6} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="4 3" />
      <Dim x1={cxCol} y1={164} x2={cxF} y2={164} label="e" />

      {/* diagrama de tensões no solo */}
      <polygon points={`${fx1},${fBot} ${fx2},${fBot} ${fx2},222 ${fx1},262`} className="fill-primary/10 stroke-primary" strokeWidth={1.2} />
      <g className="stroke-primary" strokeWidth={1.2}>
        {[210, 270, 330, 390, 450, 510].map((x, i) => (
          <line key={i} x1={x} y1={edge(x)} x2={x} y2={fBot + 2} markerEnd="url(#gf-arrow)" />
        ))}
      </g>
      <Tag x={fx1} y={276} anchor="start" muted size={11} italic>
        σmax
      </Tag>
      <Tag x={fx2} y={236} anchor="end" muted size={11} italic>
        σmin
      </Tag>

      {/* cotas */}
      <Dim x1={fx1} y1={fTop - 14} x2={fx2} y2={fTop - 14} label="a" />
      <Dim x1={fx2 + 16} y1={fTop} x2={fx2 + 16} y2={fBot} label="h" />

      {/* badges → grupos do formulário */}
      {/* 1. Tipo de cálculo */}
      <Connector x1={132} y1={78} x2={272} y2={110} />
      <Anchor x={120} y={74} n={1} />
      {/* 2. Cargas */}
      <Connector x1={392} y1={88} x2={332} y2={96} />
      <Anchor x={404} y={84} n={2} />
      {/* 3. Geometria */}
      <Connector x1={596} y1={fTop} x2={fx2 + 8} y2={fTop} />
      <Anchor x={608} y={fTop} n={3} />
      {/* 4. Solo e materiais */}
      <Connector x1={596} y1={236} x2={fx2 + 2} y2={232} />
      <Anchor x={608} y={236} n={4} />
    </Schematic>
  );
}
