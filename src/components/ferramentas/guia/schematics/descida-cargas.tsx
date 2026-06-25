/**
 * Esquema da descida de cargas (corte): pavimentos empilhados com sua área de
 * influência, descarregando no pilar e acumulando a força normal (N) até a
 * base. Os badges ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Anchor, Connector, Tag } from "../schematic-kit";

export function LoadDescentSchematic() {
  const cx = 360;
  const colX1 = 350;
  const colX2 = 370;
  const slabX1 = 230;
  const slabX2 = 490;
  const pisos: [number, string][] = [
    [78, "Cobertura"],
    [146, "Tipo 2"],
    [214, "Tipo 1"],
  ];

  return (
    <Schematic viewBox="0 0 720 300">
      {/* pilar */}
      <rect x={colX1} y={50} width={colX2 - colX1} height={238 - 50} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />

      {/* pavimentos */}
      {pisos.map(([y, nome], i) => (
        <g key={i}>
          <rect x={slabX1} y={y} width={slabX2 - slabX1} height={12} className="fill-muted stroke-foreground/70" strokeWidth={1.1} />
          {/* carga do piso */}
          <g className="stroke-primary" strokeWidth={1.2}>
            {[cx - 34, cx, cx + 34].map((x, j) => (
              <line key={j} x1={x} y1={y - 18} x2={x} y2={y - 2} markerEnd="url(#gf-arrow)" />
            ))}
          </g>
          <Tag x={slabX2 + 10} y={y + 6} anchor="start" muted size={11}>
            {nome}
          </Tag>
        </g>
      ))}

      {/* área de influência (no topo) */}
      <rect x={296} y={58} width={128} height={16} className="fill-primary/10 stroke-primary" strokeWidth={1} strokeDasharray="5 3" />
      <Tag x={cx} y={48} muted size={11} italic>
        área de influência (g, q)
      </Tag>

      {/* acúmulo de N até a base */}
      <line x1={cx} y1={238} x2={cx} y2={286} className="stroke-primary" strokeWidth={2} markerEnd="url(#gf-arrow)" />
      <Tag x={cx + 14} y={272} anchor="start" muted size={11} italic>
        N (base)
      </Tag>

      {/* badges → grupos do formulário */}
      {/* 1. Pavimentos */}
      <Connector x1={162} y1={146} x2={slabX1 - 2} y2={152} />
      <Anchor x={150} y={146} n={1} />
      {/* 2. Redução da sobrecarga */}
      <Connector x1={468} y1={252} x2={372} y2={262} />
      <Anchor x={480} y={250} n={2} />
    </Schematic>
  );
}
