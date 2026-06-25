/**
 * Esquema da ação do vento: elevação de uma edificação recebendo o vento (Vk),
 * com a altura (h) e a largura em planta (l1). Os badges ligam o desenho aos
 * grupos de campos do formulário.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function WindForceSchematic() {
  const bx1 = 330;
  const bx2 = 470;
  const bTop = 80;
  const ground = 250;

  return (
    <Schematic viewBox="0 0 720 300">
      {/* edificação */}
      <rect x={bx1} y={bTop} width={bx2 - bx1} height={ground - bTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* terreno */}
      <line x1={170} y1={ground} x2={560} y2={ground} className="stroke-foreground/70" strokeWidth={1.2} />
      {Array.from({ length: 9 }, (_, i) => 170 + i * 45).map((x, i) => (
        <line key={i} x1={x} y1={ground + 8} x2={x + 8} y2={ground} className="stroke-foreground/45" strokeWidth={1} />
      ))}

      {/* vento */}
      <g className="stroke-primary" strokeWidth={1.4}>
        {[110, 150, 190, 230].map((y, i) => (
          <line key={i} x1={200} y1={y} x2={bx1 - 4} y2={y} markerEnd="url(#gf-arrow)" />
        ))}
      </g>
      <Tag x={250} y={98} muted size={12} italic>
        Vk
      </Tag>

      {/* cotas */}
      <Dim x1={170} y1={bTop} x2={170} y2={ground} label="h" />
      <Dim x1={bx1} y1={ground + 22} x2={bx2} y2={ground + 22} label="l1" />

      {/* badges → grupos do formulário */}
      {/* 1. Velocidade básica */}
      <Connector x1={250} y1={100} x2={250} y2={110} />
      <Anchor x={250} y={90} n={1} />
      {/* 2. Terreno e edificação */}
      <Connector x1={548} y1={ground} x2={bx2 + 2} y2={ground} />
      <Anchor x={560} y={ground} n={2} />
      {/* 3. Fator estatístico */}
      <Connector x1={400} y1={68} x2={400} y2={bTop - 2} />
      <Anchor x={400} y={58} n={3} />
      {/* 4. Força de arrasto (opcional) */}
      <Connector x1={528} y1={170} x2={bx2 + 2} y2={170} />
      <Anchor x={540} y={170} n={4} />
    </Schematic>
  );
}
