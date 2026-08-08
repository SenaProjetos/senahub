"use client";

import { abasSeta, caixaMarcacao, caminhoNuvem, type Marcacao } from "@/modules/projetos/pendencias/marcacao";
import { formatarMedida } from "@/modules/projetos/pendencias/medicao";

/**
 * Desenha UMA marcação vetorial (item 9) sobre a página, em px, dentro de um `<svg>` do
 * chamador. Só desenha — quem decide posição e cor é quem chama.
 *
 * Traço em `currentColor`: a cor vem da classe Tailwind do `<g>` pai (o mesmo mapa de status
 * que já pinta o pino), sem hex solto no componente — o design system do repo proíbe cor
 * cravada fora do `globals.css`.
 *
 * `vectorEffect="non-scaling-stroke"` mantém a espessura constante quando o usuário dá zoom:
 * o SVG escala junto com a página, e sem isso um retângulo em 400% viraria uma tarja grossa.
 */
export function MarcacaoSvg({
  dim,
  x,
  y,
  marcacao,
  espessura = 2,
  medidaMm = null,
}: {
  dim: { w: number; h: number };
  x: number;
  y: number;
  marcacao: Marcacao;
  espessura?: number;
  /** Só em `tipo="medida"` (item 28): o valor congelado, desenhado sobre a linha de cota. */
  medidaMm?: number | null;
}) {
  const comum = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: espessura,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (marcacao.tipo === "medida") {
    // Linha de cota: traço entre os dois pontos + travessões perpendiculares nas pontas, e o
    // valor por cima. Sem seta — cota de projeto não aponta pra lugar nenhum, ela delimita.
    const p = marcacao.pontos[0];
    const a = { x: x * dim.w, y: y * dim.h };
    const b = { x: (x + p.dx) * dim.w, y: (y + p.dy) * dim.h };
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    // Perpendicular unitária, para os travessões das extremidades.
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const t = 6;
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const rotulo = formatarMedida(medidaMm);
    // Mantém o texto sempre legível: viraria de cabeça pra baixo entre 90° e 270°.
    const grausTexto = (ang * 180) / Math.PI;
    const grausLegivel = grausTexto > 90 || grausTexto < -90 ? grausTexto + 180 : grausTexto;
    return (
      <>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...comum} />
        <line x1={a.x - nx * t} y1={a.y - ny * t} x2={a.x + nx * t} y2={a.y + ny * t} {...comum} />
        <line x1={b.x - nx * t} y1={b.y - ny * t} x2={b.x + nx * t} y2={b.y + ny * t} {...comum} />
        <text
          x={meio.x}
          y={meio.y}
          transform={`rotate(${grausLegivel} ${meio.x} ${meio.y}) translate(0 -5)`}
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize={12}
          fontWeight={600}
          // O traço passa por baixo do texto; o contorno claro mantém o número legível.
          paintOrder="stroke"
          style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}
        >
          {rotulo}
        </text>
      </>
    );
  }

  if (marcacao.tipo === "seta") {
    const p = marcacao.pontos[0];
    const cauda = { x: x * dim.w, y: y * dim.h };
    const ponta = { x: (x + p.dx) * dim.w, y: (y + p.dy) * dim.h };
    // Aba proporcional ao comprimento, com piso/teto pra seta muito curta ou muito longa não
    // virar, respectivamente, uma flecha sem ponta ou uma ponta maior que o corpo.
    const comprimento = Math.hypot(ponta.x - cauda.x, ponta.y - cauda.y);
    const [a, b] = abasSeta(cauda, ponta, Math.min(22, Math.max(7, comprimento * 0.18)));
    return (
      <>
        <line x1={cauda.x} y1={cauda.y} x2={ponta.x} y2={ponta.y} {...comum} />
        <polyline points={`${a.x},${a.y} ${ponta.x},${ponta.y} ${b.x},${b.y}`} {...comum} />
      </>
    );
  }

  const caixa = caixaMarcacao(x, y, marcacao);
  const px = {
    esquerda: caixa.esquerda * dim.w,
    topo: caixa.topo * dim.h,
    largura: caixa.largura * dim.w,
    altura: caixa.altura * dim.h,
  };

  if (marcacao.tipo === "nuvem") {
    // Onda proporcional ao menor lado, limitada: numa caixa estreita um raio fixo devoraria a
    // forma, e numa caixa enorme viraria um retângulo levemente ondulado.
    const raio = Math.min(18, Math.max(6, Math.min(px.largura, px.altura) / 6));
    return (
      <path
        d={caminhoNuvem(px.largura, px.altura, raio)}
        transform={`translate(${px.esquerda} ${px.topo})`}
        {...comum}
      />
    );
  }

  return <rect x={px.esquerda} y={px.topo} width={px.largura} height={px.altura} rx={2} {...comum} />;
}
