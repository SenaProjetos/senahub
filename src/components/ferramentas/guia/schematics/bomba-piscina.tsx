/**
 * Esquema da recirculação da piscina (circuito fechado, superfície livre): sucção do fundo/skimmer,
 * bomba, filtro e retorno. Hm soma as perdas da sucção, do retorno, dos equipamentos e a pressão nos
 * retornos — sem desnível geométrico. Os badges ligam o desenho aos grupos de campos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function BombaPiscinaSchematic() {
  return (
    <Schematic viewBox="0 0 720 300">
      {/* piscina (corte) */}
      <rect x={70} y={50} width={250} height={140} className="fill-card stroke-foreground/70" strokeWidth={1.5} />
      <rect x={71} y={72} width={248} height={117} className="fill-primary/15" />
      <Tag x={195} y={130} muted size={12} italic>
        volume V
      </Tag>
      <Dim x1={338} y1={72} x2={338} y2={190} label="h" />
      <Dim x1={70} y1={206} x2={320} y2={206} label="C × L" />

      {/* sucção (fundo) até a bomba */}
      <path d="M 150 190 L 150 250 L 380 250" className="fill-none stroke-foreground/70" strokeWidth={1.6} />
      <Tag x={265} y={266} muted size={11} italic>
        sucção: L + Leq
      </Tag>

      {/* bomba */}
      <circle cx={394} cy={250} r={14} className="fill-muted stroke-foreground/70" strokeWidth={1.3} />
      <Tag x={394} y={280} size={11}>
        bomba
      </Tag>

      {/* filtro */}
      <rect x={470} y={226} width={54} height={48} rx={8} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <Tag x={497} y={250} size={11}>
        filtro
      </Tag>
      <line x1={408} y1={250} x2={470} y2={250} className="stroke-foreground/70" strokeWidth={1.6} />

      {/* retorno */}
      <path d="M 524 250 L 600 250 L 600 96 L 320 96" className="fill-none stroke-foreground/70" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={612} y={172} anchor="start" muted size={11} italic>
        retorno: L + Leq
      </Tag>

      {/* badges → grupos */}
      {/* 1. Piscina */}
      <Connector x1={195} y1={30} x2={195} y2={52} />
      <Anchor x={195} y={20} n={1} />
      {/* 2. Tubulações */}
      <Connector x1={640} y1={210} x2={603} y2={200} />
      <Anchor x={652} y={212} n={2} />
      {/* 3. Equipamentos e bomba */}
      <Connector x1={440} y1={200} x2={470} y2={228} />
      <Anchor x={430} y={188} n={3} />
    </Schematic>
  );
}
