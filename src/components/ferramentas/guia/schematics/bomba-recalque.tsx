/**
 * Esquema da bomba de recalque: reservatório inferior (sucção), conjunto motor-bomba e recalque até o
 * reservatório superior. Hg = altura de sucção + altura de recalque; Hm soma as perdas de carga dos dois
 * trechos. Os badges ligam o desenho aos grupos de campos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function BombaRecalqueSchematic() {
  const pumpX = 260;
  const pumpY = 200;
  const aguaInf = 222;
  const aguaSup = 60;
  return (
    <Schematic viewBox="0 0 720 300">
      {/* reservatório inferior */}
      <rect x={60} y={170} width={120} height={100} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <rect x={61} y={aguaInf} width={118} height={47} className="fill-primary/15" />
      <Tag x={120} y={250} muted size={11} italic>
        Inferior
      </Tag>

      {/* sucção */}
      <path d={`M 120 ${aguaInf + 14} L 120 ${pumpY} L ${pumpX - 14} ${pumpY}`} className="fill-none stroke-foreground/70" strokeWidth={1.6} />
      <Tag x={190} y={pumpY - 12} muted size={11} italic>
        L_s + Leq
      </Tag>

      {/* bomba */}
      <circle cx={pumpX} cy={pumpY} r={14} className="fill-muted stroke-foreground/70" strokeWidth={1.3} />
      <Tag x={pumpX} y={pumpY + 30} size={11}>
        motor-bomba
      </Tag>

      {/* recalque */}
      <path d={`M ${pumpX + 14} ${pumpY} L 400 ${pumpY} L 400 ${aguaSup + 18} L 470 ${aguaSup + 18}`} className="fill-none stroke-foreground/70" strokeWidth={1.6} />
      <Tag x={410} y={pumpY + 16} anchor="start" muted size={11} italic>
        L_r + Leq
      </Tag>

      {/* reservatório superior */}
      <rect x={470} y={30} width={170} height={90} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <rect x={471} y={aguaSup} width={168} height={59} className="fill-primary/15" />
      <Tag x={555} y={104} muted size={11} italic>
        Superior
      </Tag>

      {/* cotas: altura de sucção (nível da água → eixo da bomba) e de recalque (eixo → nível superior) */}
      <Dim x1={228} y1={aguaInf} x2={228} y2={pumpY} label="h_s" />
      <Dim x1={440} y1={pumpY} x2={440} y2={aguaSup} label="h_r" />
      <line x1={180} y1={aguaInf} x2={236} y2={aguaInf} className="stroke-muted-foreground/60" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={470} y1={aguaSup} x2={448} y2={aguaSup} className="stroke-muted-foreground/60" strokeWidth={1} strokeDasharray="4 3" />

      {/* vazão */}
      <line x1={400} y1={pumpY - 24} x2={400} y2={pumpY - 56} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={386} y={pumpY - 40} anchor="end" size={12} italic>
        Q
      </Tag>

      {/* badges → grupos */}
      {/* 1. Vazão */}
      <Connector x1={560} y1={190} x2={404} y2={168} />
      <Anchor x={572} y={192} n={1} />
      {/* 2. Desníveis e tubulações */}
      <Connector x1={330} y1={110} x2={232} y2={190} />
      <Anchor x={338} y={100} n={2} />
      {/* 3. Conjunto motor-bomba */}
      <Connector x1={330} y1={258} x2={270} y2={228} />
      <Anchor x={342} y={262} n={3} />
    </Schematic>
  );
}
