/**
 * Desenho esquemático (didático, fora de escala) da viga de concreto à flexão:
 * seção transversal cotada (b, h, d) + viga biapoiada com carga distribuída e
 * vão. Os badges numerados ligam o desenho aos grupos de campos do formulário.
 */

import {
  Schematic,
  Dim,
  LoadArrows,
  SupportPin,
  SupportRoller,
  Anchor,
  Connector,
  Tag,
} from "../schematic-kit";

export function VigaSchematic() {
  // Seção transversal (esquerda)
  const sx = 70; // x esquerda
  const sw = 64; // largura b
  const sTop = 46;
  const sBot = 196;
  const rebarY = 178; // nível da armadura de tração
  const sx2 = sx + sw;
  const sMid = sx + sw / 2;

  // Viga longitudinal (direita)
  const bx1 = 252;
  const bx2 = 676;
  const bTop = 150;
  const bBot = 188;
  const bMid = (bx1 + bx2) / 2;

  return (
    <Schematic viewBox="0 0 720 286">
      {/* ===== Seção transversal ===== */}
      <rect x={sx} y={sTop} width={sw} height={sBot - sTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      {/* armadura de tração */}
      <line x1={sx} y1={rebarY} x2={sx2} y2={rebarY} className="stroke-primary/40" strokeWidth={1} strokeDasharray="4 3" />
      {[0.22, 0.5, 0.78].map((f, i) => (
        <circle key={i} cx={sx + sw * f} cy={rebarY} r={3.4} className="fill-foreground" />
      ))}
      {/* cotas da seção */}
      <Dim x1={sx - 18} y1={sTop} x2={sx - 18} y2={rebarY} label="d" />
      <Dim x1={sx2 + 16} y1={sTop} x2={sx2 + 16} y2={sBot} label="h" />
      <Dim x1={sx} y1={sBot + 16} x2={sx2} y2={sBot + 16} label="b" />
      <Tag x={sMid} y={sTop - 24} muted size={11}>
        Seção transversal
      </Tag>

      {/* badges da seção */}
      <Connector x1={sMid} y1={sBot + 30} x2={sMid} y2={sBot + 8} />
      <Anchor x={sMid} y={sBot + 42} n={1} />
      <Connector x1={sx2 + 40} y1={120} x2={sx2 + 28} y2={120} />
      <Anchor x={sx2 + 52} y={120} n={2} />
      <Connector x1={sx - 40} y1={rebarY} x2={sx - 6} y2={rebarY} />
      <Anchor x={sx - 52} y={rebarY} n={3} />

      {/* ===== Viga longitudinal ===== */}
      <LoadArrows x1={bx1 + 8} x2={bx2 - 8} y={116} depth={28} n={9} />
      <Tag x={bx1 + 2} y={108} anchor="end" muted size={11} italic>
        q
      </Tag>
      <rect x={bx1} y={bTop} width={bx2 - bx1} height={bBot - bTop} className="fill-muted stroke-foreground/70" strokeWidth={1.2} />
      <SupportPin x={bx1} y={bBot} />
      <SupportRoller x={bx2} y={bBot} />
      <Dim x1={bx1} y1={236} x2={bx2} y2={236} label="Vão (L)" />
      <Tag x={bMid} y={bTop - 36} muted size={11}>
        Viga biapoiada
      </Tag>

      {/* badges da viga */}
      <Connector x1={bMid} y1={96} x2={bMid} y2={116} />
      <Anchor x={bMid} y={84} n={5} />
      <Connector x1={bMid + 70} y1={210} x2={bMid + 70} y2={bBot} />
      <Anchor x={bMid + 70} y={222} n={4} />
      <Tag x={bMid + 70} y={205} muted size={10.5} italic>
        M, V
      </Tag>
    </Schematic>
  );
}
