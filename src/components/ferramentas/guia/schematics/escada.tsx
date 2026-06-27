/**
 * Esquema da escada (corte longitudinal): lance reto com degraus (piso g,
 * espelho e) + patamar, apoiada nas extremidades, com o vão L e a carga.
 */

import { Schematic, Dim, SupportPin, SupportRoller, Anchor, Connector, Tag } from "../schematic-kit";

// Corpo da escada (degraus em cima, soffit inclinado embaixo + patamar).
const CORPO = [
  [150, 215], [150, 193], [192, 193], [192, 171], [234, 171], [234, 149],
  [276, 149], [276, 127], [330, 127], [470, 127], [470, 146], [330, 146], [150, 234],
]
  .map((p) => p.join(","))
  .join(" ");

export function EscadaSchematic() {
  return (
    <Schematic viewBox="0 0 720 300">
      <polygon points={CORPO} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* apoios */}
      <SupportPin x={150} y={234} />
      <SupportRoller x={470} y={146} />

      {/* carga distribuída sobre o lance */}
      <g className="stroke-primary" strokeWidth={1.3}>
        <line x1={160} y1={92} x2={326} y2={92} />
        {[176, 218, 260, 302].map((x, i) => (
          <line key={i} x1={x} y1={92} x2={x} y2={110} markerEnd="url(#gf-arrow)" />
        ))}
      </g>
      <Tag x={150} y={86} anchor="start" muted size={11} italic>
        g + q
      </Tag>

      {/* degrau em destaque: piso (g) e espelho (e) */}
      <Dim x1={192} y1={184} x2={234} y2={184} label="g" />
      <Dim x1={246} y1={149} x2={246} y2={171} label="e" />

      {/* vão */}
      <Dim x1={150} y1={262} x2={470} y2={262} label="L (vão)" />

      <Tag x={240} y={118} muted size={11}>
        Lance
      </Tag>
      <Tag x={400} y={118} muted size={11}>
        Patamar
      </Tag>

      {/* badges → grupos do formulário */}
      {/* 1. Vinculação → apoio */}
      <Connector x1={112} y1={224} x2={146} y2={232} />
      <Anchor x={100} y={220} n={1} />
      {/* 2. Geometria → degraus / lance */}
      <Connector x1={300} y1={178} x2={240} y2={176} />
      <Anchor x={312} y={178} n={2} />
      {/* 3. Cargas → carga sobre o lance */}
      <Connector x1={250} y1={84} x2={250} y2={92} />
      <Anchor x={250} y={72} n={3} />
      {/* 4. Materiais → corpo (laje da escada) */}
      <Connector x1={528} y1={132} x2={472} y2={134} />
      <Anchor x={540} y={132} n={4} />
    </Schematic>
  );
}
