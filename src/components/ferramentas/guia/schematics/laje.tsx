/**
 * Esquema da laje maciça (vista em planta): retângulo lx × ly com bordas
 * apoiadas (hachura), carga distribuída p e os dois vãos cotados.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function LajeSchematic() {
  const x1 = 150;
  const x2 = 560; // ly (maior vão, horizontal)
  const y1 = 70;
  const y2 = 226; // lx (menor vão, vertical)
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  // hachura curta ao longo de uma borda (apoio)
  const hatch = (pts: [number, number][]) =>
    pts.map(([hx, hy], i) => <line key={i} x1={hx} y1={hy} x2={hx + 7} y2={hy + 7} className="stroke-foreground/45" strokeWidth={1} />);

  const topHatch = Array.from({ length: 9 }, (_, i): [number, number] => [x1 + 8 + i * 46, y1 - 8]);
  const botHatch = Array.from({ length: 9 }, (_, i): [number, number] => [x1 + 8 + i * 46, y2 + 1]);
  const leftHatch = Array.from({ length: 3 }, (_, i): [number, number] => [x1 - 8, y1 + 12 + i * 46]);
  const rightHatch = Array.from({ length: 3 }, (_, i): [number, number] => [x2 + 1, y1 + 12 + i * 46]);

  return (
    <Schematic viewBox="0 0 720 300">
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      {hatch(topHatch)}
      {hatch(botHatch)}
      {hatch(leftHatch)}
      {hatch(rightHatch)}

      {/* carga distribuída (símbolo no centro) */}
      {[-1, 0, 1].map((k) => (
        <line key={k} x1={cx + k * 26} y1={cy - 14} x2={cx + k * 26} y2={cy + 10} className="stroke-primary" strokeWidth={1.3} markerEnd="url(#gf-arrow)" />
      ))}
      <Tag x={cx} y={cy - 24} muted size={12} italic>
        p
      </Tag>

      <Dim x1={x1 - 30} y1={y1} x2={x1 - 30} y2={y2} label="lx" />
      <Dim x1={x1} y1={y2 + 30} x2={x2} y2={y2 + 30} label="ly" />
      <Tag x={cx} y={y1 - 28} muted size={11}>
        Laje (planta)
      </Tag>

      {/* 1. Vinculação → borda apoiada (hachura) */}
      <Connector x1={x1 + 30} y1={48} x2={x1 + 30} y2={y1 - 6} />
      <Anchor x={x1 + 30} y={36} n={1} />
      {/* 2. Geometria → cotas dos vãos */}
      <Connector x1={cx} y1={y2 + 46} x2={cx} y2={y2 + 36} />
      <Anchor x={cx} y={y2 + 58} n={2} />
      {/* 3. Carregamento → carga distribuída */}
      <Connector x1={cx + 70} y1={cy} x2={cx + 36} y2={cy} />
      <Anchor x={cx + 84} y={cy} n={3} />
      {/* 4. Materiais → corpo da laje (concreto) */}
      <Connector x1={x2 + 40} y1={cy} x2={x2 + 8} y2={cy} />
      <Anchor x={x2 + 52} y={cy} n={4} />
    </Schematic>
  );
}
