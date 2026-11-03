/**
 * Esquema dos reservatórios: inferior (recebe da rua) e superior (abastece), ligados por recalque.
 * O consumo diário CD entra pela rua; V_res = CD × dias é dividido entre os dois; a reserva técnica
 * de incêndio (RTI) é somada ao reservatório escolhido. Os badges ligam o desenho aos grupos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function ReservatoriosSchematic() {
  return (
    <Schematic viewBox="0 0 720 300">
      {/* rua → reservatório inferior */}
      <line x1={40} y1={225} x2={110} y2={225} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={40} y={208} anchor="start" muted size={11} italic>
        CD
      </Tag>

      {/* reservatório inferior */}
      <rect x={110} y={170} width={190} height={90} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <rect x={111} y={195} width={188} height={64} className="fill-primary/15" />
      <Tag x={205} y={228} muted size={12} italic>
        Inferior — (fração) × V_res
      </Tag>
      <Dim x1={318} y1={170} x2={318} y2={260} label="h" />

      {/* recalque */}
      <circle cx={338} cy={236} r={13} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      <path d="M 338 223 L 338 74 L 440 74" className="fill-none stroke-foreground/70" strokeWidth={1.6} />
      <line x1={300} y1={236} x2={325} y2={236} className="stroke-foreground/70" strokeWidth={1.6} />

      {/* reservatório superior */}
      <rect x={440} y={40} width={200} height={100} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <rect x={441} y={64} width={198} height={75} className="fill-primary/15" />
      {/* faixa da reserva de incêndio (RTI) */}
      <rect x={441} y={104} width={198} height={35} className="fill-muted/70" />
      <Tag x={540} y={122} muted size={11} italic>
        RTI (incêndio)
      </Tag>
      <Tag x={540} y={84} muted size={12} italic>
        Superior — (1 − fração) × V_res
      </Tag>

      {/* abastecimento do prédio */}
      <line x1={640} y1={110} x2={690} y2={110} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={668} y={96} muted size={11} italic>
        CD
      </Tag>

      {/* badges → grupos */}
      {/* 1. Consumo */}
      <Connector x1={64} y1={196} x2={64} y2={219} />
      <Anchor x={64} y={184} n={1} />
      {/* 2. Reserva e reservatórios */}
      <Connector x1={205} y1={152} x2={205} y2={172} />
      <Anchor x={205} y={140} n={2} />
      {/* 3. Reserva técnica de incêndio */}
      <Connector x1={540} y1={176} x2={540} y2={141} />
      <Anchor x={540} y={188} n={3} />
    </Schematic>
  );
}
