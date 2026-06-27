/**
 * Esquema da estaca por SPT (corte): perfil de solo em camadas com seus NSPT
 * e a estaca cravada, mobilizando resistência de ponta (Rp) e lateral (Rl).
 * Os badges ligam o desenho aos grupos de campos do formulário.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function PileSptSchematic() {
  const sx1 = 130;
  const sx2 = 590;
  const ground = 56;
  const cx = 360;
  const pw = 40;
  const px1 = cx - pw / 2;
  const px2 = cx + pw / 2;
  const tipY = 250;

  // camadas: [topo, base, opacidade-classe, NSPT]
  const camadas: [number, number, string, string][] = [
    [56, 118, "fill-muted/30", "N≈8"],
    [118, 186, "fill-muted/55", "N≈15"],
    [186, 262, "fill-muted/80", "N≈30"],
  ];

  return (
    <Schematic viewBox="0 0 720 300">
      {/* camadas de solo */}
      {camadas.map(([t, b, fill], i) => (
        <rect key={i} x={sx1} y={t} width={sx2 - sx1} height={b - t} className={`${fill} stroke-foreground/40`} strokeWidth={1} />
      ))}
      {/* superfície do terreno */}
      <line x1={sx1 - 6} y1={ground} x2={sx2 + 6} y2={ground} className="stroke-foreground/70" strokeWidth={1.2} />

      {/* NSPT por camada */}
      {camadas.map(([t, b, , nspt], i) => (
        <Tag key={i} x={250} y={(t + b) / 2} anchor="end" muted size={11} italic>
          {nspt}
        </Tag>
      ))}

      {/* estaca (fuste + ponta) */}
      <rect x={px1} y={44} width={pw} height={tipY - 44} className="fill-card stroke-foreground/70" strokeWidth={1.3} />
      <polygon points={`${px1},${tipY} ${px2},${tipY} ${cx},${tipY + 16}`} className="fill-card stroke-foreground/70" strokeWidth={1.3} />

      {/* diâmetro */}
      <Dim x1={px1} y1={32} x2={px2} y2={32} label="d" />

      {/* atrito lateral Rl */}
      <g className="stroke-primary" strokeWidth={1.2}>
        {[120, 165, 210].map((y, i) => (
          <line key={i} x1={px2 + 10} y1={y + 12} x2={px2 + 10} y2={y - 4} markerEnd="url(#gf-arrow)" />
        ))}
      </g>
      <Tag x={px2 + 22} y={150} anchor="start" muted size={11} italic>
        Rl
      </Tag>

      {/* resistência de ponta Rp */}
      <line x1={cx} y1={292} x2={cx} y2={tipY + 20} className="stroke-primary" strokeWidth={1.6} markerEnd="url(#gf-arrow)" />
      <Tag x={cx + 14} y={284} anchor="start" muted size={11} italic>
        Rp
      </Tag>

      {/* badges → grupos do formulário */}
      {/* 1. Estaca (tipo, diâmetro) */}
      <Connector x1={458} y1={96} x2={px2 + 2} y2={104} />
      <Anchor x={470} y={92} n={1} />
      {/* 2. Perfil de sondagem (camadas) */}
      <Connector x1={108} y1={150} x2={sx1 - 2} y2={150} />
      <Anchor x={96} y={150} n={2} />
    </Schematic>
  );
}
