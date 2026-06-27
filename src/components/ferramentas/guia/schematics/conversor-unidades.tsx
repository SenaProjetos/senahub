/**
 * Esquema do conversor de unidades: caixa de origem (De: valor) convertida por
 * um fator para a caixa de destino (Para: resultado), dentro de uma grandeza.
 * Os badges ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Anchor, Connector, Tag } from "../schematic-kit";

export function UnitConvertSchematic() {
  const ax1 = 130;
  const ax2 = 310;
  const bx1 = 410;
  const bx2 = 590;
  const top = 80;
  const headBot = 106;
  const bot = 152;

  return (
    <Schematic viewBox="0 0 720 210">
      {/* título: grandeza */}
      <Anchor x={300} y={44} n={1} />
      <Tag x={318} y={44} anchor="start" size={13}>
        Grandeza
      </Tag>

      {/* caixa De */}
      <rect x={ax1} y={top} width={ax2 - ax1} height={bot - top} className="fill-card stroke-foreground/60" strokeWidth={1.2} rx={4} />
      <rect x={ax1} y={top} width={ax2 - ax1} height={headBot - top} className="fill-muted stroke-foreground/60" strokeWidth={1.2} />
      <Tag x={(ax1 + ax2) / 2} y={(top + headBot) / 2} muted size={12}>
        De (unidade)
      </Tag>
      <Tag x={(ax1 + ax2) / 2} y={(headBot + bot) / 2} size={13} italic>
        valor
      </Tag>

      {/* conversão */}
      <line x1={ax2 + 6} y1={(top + bot) / 2} x2={bx1 - 6} y2={(top + bot) / 2} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={(ax2 + bx1) / 2} y={(top + bot) / 2 - 12} muted size={11} italic>
        × fator
      </Tag>

      {/* caixa Para */}
      <rect x={bx1} y={top} width={bx2 - bx1} height={bot - top} className="fill-card stroke-foreground/60" strokeWidth={1.2} rx={4} />
      <rect x={bx1} y={top} width={bx2 - bx1} height={headBot - top} className="fill-muted stroke-foreground/60" strokeWidth={1.2} />
      <Tag x={(bx1 + bx2) / 2} y={(top + headBot) / 2} muted size={12}>
        Para (unidade)
      </Tag>
      <Tag x={(bx1 + bx2) / 2} y={(headBot + bot) / 2} size={13} italic>
        resultado
      </Tag>

      {/* badges → grupos do formulário */}
      {/* 2. Unidades → cabeçalho da caixa */}
      <Connector x1={(ax1 + ax2) / 2} y1={70} x2={(ax1 + ax2) / 2} y2={top - 2} />
      <Anchor x={(ax1 + ax2) / 2} y={60} n={2} />
      {/* 3. Valor → corpo da caixa De */}
      <Connector x1={108} y1={(headBot + bot) / 2} x2={ax1 - 2} y2={(headBot + bot) / 2} />
      <Anchor x={96} y={(headBot + bot) / 2} n={3} />
    </Schematic>
  );
}
