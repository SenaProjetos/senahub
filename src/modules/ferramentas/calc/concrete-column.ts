/**
 * Engine E04 — Pilar de concreto à FLEXO-COMPRESSÃO OBLÍQUA (NBR 6118:2023).
 * Puro. Seção em cm, forças em kN, fck em MPa (→ kN/cm² ÷10), momentos de entrada em kN·m.
 *
 * Abordagem (dimensionar As por integração N-M, já que o ábaco não é digitalizável):
 *  1. Esbeltez λ e λ1 por direção; momento mínimo de 1ª ordem; 2ª ordem por pilar-padrão com
 *     curvatura aproximada (válido λ ≤ 90).
 *  2. Momento resistente UNIAXIAL a um dado Nd por integração do bloco retangular + aço (arranjo
 *     simétrico As/2 em cada face perpendicular ao eixo de flexão).
 *  3. Dimensiona As (bisseção) até atender a interação biaxial aproximada (NBR 6118 17.2.5.2):
 *        (Mdx/Mxr)^α + (Mdy/Myr)^α ≤ 1
 *     com Mxr, Myr = momentos resistentes uniaxiais a Nd para o As. α informado (default 1,0
 *     conservador; a norma admite 1,0 a 2,0 para seções retangulares).
 *
 * Limites: método de 2ª ordem só p/ λ ≤ 90; arranjo simétrico nas duas faces (a interação α cobre
 * a sobreposição). A conferência cabe ao engenheiro (ART/RRT).
 */

import { z } from "zod";
import { parametrosConcreto, ACOS } from "./concrete-beam-flexure";

const ES = 21000; // kN/cm² (210 GPa)

export const entradaSchema = z.object({
  b: z.number().positive(), // cm — largura (dimensão no eixo horizontal)
  h: z.number().positive(), // cm — altura (dimensão no eixo vertical)
  fck: z.number().min(20).max(90), // MPa
  aco: z.enum(["CA-25", "CA-50", "CA-60"]),
  dLinha: z.number().positive().default(4), // cm — distância do CG das barras à face
  Nd: z.number().positive(), // kN — força normal de cálculo
  Mdx: z.number().min(0).default(0), // kN·m — momento de cálculo, flexão em torno de x (profundidade h)
  Mdy: z.number().min(0).default(0), // kN·m — momento de cálculo, flexão em torno de y (profundidade b)
  lex: z.number().positive(), // cm — comprimento de flambagem, flexão em torno de x
  ley: z.number().positive(), // cm — comprimento de flambagem, flexão em torno de y
  alphaB: z.number().min(0.4).max(1).default(1), // αb do diagrama de momentos
  alphaInteracao: z.number().min(1).max(2).default(1), // expoente α da interação biaxial
  phi: z.number().positive().default(20), // mm — bitola sugerida para o arranjo
});

export type EntradaPilar = z.infer<typeof entradaSchema>;
export type EntradaPilarInput = z.input<typeof entradaSchema>;

type Params = ReturnType<typeof parametrosConcreto>;

/** Tensão no aço (kN/cm²) por deformação, limitada a ±fyd. Compressão positiva. */
function sigmaAco(eps: number, fyd: number): number {
  return Math.max(-fyd, Math.min(fyd, ES * eps));
}

/**
 * Esforços (N, M) de uma seção retangular largura×profundidade com armadura simétrica As/2 em
 * cada face perpendicular à flexão, para uma posição x da linha neutra (medida da fibra mais
 * comprimida). Compressão positiva; M em torno do centroide. N em kN, M em kN·cm.
 */
export function secaoNM(
  x: number,
  As: number,
  largura: number,
  profundidade: number,
  dLinha: number,
  sigmaCd: number,
  fyd: number,
  p: Params,
): { N: number; M: number } {
  const H = profundidade;
  const y = Math.min(p.lambda * x, H); // altura do bloco retangular
  const Nc = sigmaCd * largura * y;
  const armNc = H / 2 - y / 2;

  const epsTop = p.epsCU * ((x - dLinha) / x); // face comprimida (z = dLinha)
  const epsBot = p.epsCU * ((x - (H - dLinha)) / x); // face tracionada (z = H - dLinha)
  const Ftop = (As / 2) * sigmaAco(epsTop, fyd);
  const Fbot = (As / 2) * sigmaAco(epsBot, fyd);
  const arm = H / 2 - dLinha;

  const N = Nc + Ftop + Fbot;
  const M = Nc * armNc + (Ftop - Fbot) * arm;
  return { N, M };
}

/**
 * Momento resistente uniaxial (kN·cm) para um Nd dado, achando x por bisseção (N(x) é monótona
 * crescente em x). Retorna 0 se Nd excede a capacidade à compressão (As insuficiente).
 */
export function momentoResistente(
  Nd: number,
  As: number,
  largura: number,
  profundidade: number,
  dLinha: number,
  sigmaCd: number,
  fyd: number,
  p: Params,
): number {
  const H = profundidade;
  const xMax = 5 * H; // garante bloco saturado (y=H) e aço escoado à compressão
  const xMin = 1e-4;
  const Nmax = secaoNM(xMax, As, largura, profundidade, dLinha, sigmaCd, fyd, p).N;
  if (Nd > Nmax) return 0; // seção não resiste ao normal nem totalmente comprimida
  const Nmin = secaoNM(xMin, As, largura, profundidade, dLinha, sigmaCd, fyd, p).N;
  if (Nd < Nmin) return 0; // tração — fora do escopo de pilar

  let lo = xMin;
  let hi = xMax;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const { N } = secaoNM(mid, As, largura, profundidade, dLinha, sigmaCd, fyd, p);
    if (N < Nd) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  return secaoNM(x, As, largura, profundidade, dLinha, sigmaCd, fyd, p).M;
}

export type EfeitoDirecao = {
  lambda: number;
  lambda1: number;
  nu: number;
  esbelto: boolean; // λ > λ1
  m1dMin: number; // kN·cm
  m1d: number; // kN·cm (1ª ordem, ≥ mínimo)
  m2d: number; // kN·cm (2ª ordem)
  mdTot: number; // kN·cm (total de cálculo)
  metodoInvalido: boolean; // λ > 90
};

/** Esbeltez, momento mínimo e 2ª ordem (pilar-padrão curvatura aproximada) em uma direção. */
export function efeitoDirecao(
  dim: number, // cm — profundidade resistente na direção
  le: number, // cm — comprimento de flambagem
  mAplicadoKNcm: number, // kN·cm — momento de 1ª ordem aplicado
  Nd: number,
  Ac: number,
  fcd: number,
  alphaB: number,
): EfeitoDirecao {
  const i = dim / Math.sqrt(12); // raio de giração
  const lambda = le / i;
  const nu = Nd / (Ac * fcd);

  const e1Min = 1.5 + 0.03 * dim; // cm (e1,mín)
  const m1dMin = Nd * e1Min;
  const m1d = Math.max(mAplicadoKNcm, m1dMin);
  const e1 = m1d / Nd; // cm

  let lambda1 = (25 + 12.5 * (e1 / dim)) / alphaB;
  lambda1 = Math.min(90, Math.max(35, lambda1));

  const esbelto = lambda > lambda1;
  const metodoInvalido = lambda > 90;

  let m2d = 0;
  if (esbelto && !metodoInvalido) {
    const hM = dim / 100; // m
    const leM = le / 100; // m
    const invR = Math.min(0.005 / (hM * (nu + 0.5)), 0.005 / hM); // 1/m
    const m2dKNm = (Nd * leM * leM * invR) / 10;
    m2d = m2dKNm * 100; // kN·cm
  }

  const mdTot = Math.max(m1d, alphaB * m1d + m2d);
  return { lambda, lambda1, nu, esbelto, m1dMin, m1d, m2d, mdTot, metodoInvalido };
}

export type ResultadoPilar = {
  nu: number;
  fcd: number;
  fyd: number;
  dirX: EfeitoDirecao;
  dirY: EfeitoDirecao;
  AsNec: number; // cm² — armadura necessária
  AsMin: number;
  AsMax: number;
  As: number; // cm² — As adotado (≥ mínimo)
  taxaGeom: number; // % — As/Ac
  interacao: number; // valor da interação no As adotado
  alphaInteracao: number;
  nBarras: number; // arranjo sugerido
  phi: number; // mm
  viavel: boolean;
  situacao: "ok" | "revisar";
  alertas: string[];
};

export function calcular(input: EntradaPilarInput): ResultadoPilar {
  const v = entradaSchema.parse(input);
  const p = parametrosConcreto(v.fck);
  const fcd = v.fck / 10 / 1.4; // kN/cm²
  const fyd = ACOS[v.aco] / 10 / 1.15; // kN/cm²
  const sigmaCd = p.alphaC * fcd;
  const Ac = v.b * v.h;
  const alertas: string[] = [];

  // 1ª/2ª ordem por direção (x: profundidade h; y: profundidade b).
  const dirX = efeitoDirecao(v.h, v.lex, v.Mdx * 100, v.Nd, Ac, fcd, v.alphaB);
  const dirY = efeitoDirecao(v.b, v.ley, v.Mdy * 100, v.Nd, Ac, fcd, v.alphaB);
  if (dirX.metodoInvalido || dirY.metodoInvalido) {
    alertas.push("λ > 90: método do pilar-padrão com curvatura aproximada não se aplica — usar análise mais rigorosa.");
  }

  const MdxTot = dirX.mdTot; // kN·cm
  const MdyTot = dirY.mdTot; // kN·cm
  const alpha = v.alphaInteracao;

  // Interação biaxial para um As (Mxr usa profundidade h e largura b; Myr usa profundidade b e largura h).
  const interacaoDe = (As: number): number => {
    const Mxr = momentoResistente(v.Nd, As, v.b, v.h, v.dLinha, sigmaCd, fyd, p);
    const Myr = momentoResistente(v.Nd, As, v.h, v.b, v.dLinha, sigmaCd, fyd, p);
    const tx = Mxr > 0 ? Math.pow(MdxTot / Mxr, alpha) : MdxTot > 0 ? Infinity : 0;
    const ty = Myr > 0 ? Math.pow(MdyTot / Myr, alpha) : MdyTot > 0 ? Infinity : 0;
    return tx + ty;
  };

  const AsMin = Math.max(0.004 * Ac, (0.15 * v.Nd) / fyd);
  const AsMax = 0.08 * Ac; // máx absoluto (incl. emendas); 4% é o limite fora de emendas
  const As4pct = 0.04 * Ac;

  // Dimensiona: menor As em [AsMin, AsMax] com interação ≤ 1.
  let AsNec: number;
  let viavel = true;
  if (interacaoDe(AsMin) <= 1) {
    AsNec = AsMin;
  } else if (interacaoDe(AsMax) > 1) {
    AsNec = AsMax;
    viavel = false;
    alertas.push("Seção insuficiente mesmo com As,máx (8% Ac): aumentar dimensões ou fck.");
  } else {
    let lo = AsMin;
    let hi = AsMax;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (interacaoDe(mid) > 1) lo = mid;
      else hi = mid;
    }
    AsNec = (lo + hi) / 2;
  }

  const As = Math.max(AsNec, AsMin);
  const interacao = interacaoDe(As);
  const taxaGeom = (As / Ac) * 100;

  let situacao: "ok" | "revisar" = viavel ? "ok" : "revisar";
  if (viavel && AsNec > As4pct) {
    situacao = "revisar";
    alertas.push(`As (${AsNec.toFixed(2)} cm²) excede 4% Ac (${As4pct.toFixed(2)} cm²): só admissível em regiões de emenda — revisar a seção.`);
  }
  if (AsNec <= AsMin + 1e-6 && interacaoDe(AsMin) <= 1) {
    alertas.push("Armadura mínima governa.");
  }

  // Arranjo sugerido: nº de barras da bitola φ (mínimo 4, par para simetria).
  const areaBarra = Math.PI * Math.pow(v.phi / 10 / 2, 2); // cm²
  let nBarras = Math.max(4, Math.ceil(As / areaBarra));
  if (nBarras % 2 !== 0) nBarras += 1;

  return {
    nu: dirX.nu,
    fcd,
    fyd,
    dirX,
    dirY,
    AsNec,
    AsMin,
    AsMax,
    As,
    taxaGeom,
    interacao,
    alphaInteracao: alpha,
    nBarras,
    phi: v.phi,
    viavel,
    situacao,
    alertas,
  };
}
