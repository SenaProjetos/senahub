/**
 * Engine E01 — Viga de concreto à FLEXÃO simples (NBR 6118:2023).
 * Puro. Unidades internas: kN, cm, kN/cm² (Mk em kN·m → ×100; fck em MPa → ÷10).
 *
 * Diagrama retangular simplificado (item 17.2.2): λ e αc dependentes de fck.
 * Dimensionamento no ELU à flexão simples, seção retangular ou T, com armadura simples
 * ou dupla (limite de ductilidade x/d). NÃO cobre flexo-compressão nem vigas contínuas.
 */

import { z } from "zod";

const ES = 21000; // módulo de elasticidade do aço, kN/cm² (210 GPa)

export const ACOS = { "CA-25": 250, "CA-50": 500, "CA-60": 600 } as const;
export type Aco = keyof typeof ACOS;

const secaoRet = z.object({ forma: z.literal("retangular"), b: z.number().positive(), h: z.number().positive() });
const secaoT = z.object({
  forma: z.literal("T"),
  bf: z.number().positive(),
  hf: z.number().positive(),
  bw: z.number().positive(),
  h: z.number().positive(),
});

export const entradaSchema = z
  .object({
    secao: z.discriminatedUnion("forma", [secaoRet, secaoT]),
    d: z.number().positive(), // altura útil (cm)
    dLinha: z.number().positive().default(4), // d' — posição da armadura comprimida (cm)
    fck: z.number().min(20).max(90), // MPa
    aco: z.enum(["CA-25", "CA-50", "CA-60"]),
    Mk: z.number().positive(), // momento característico (kN·m)
    gamaF: z.number().positive().default(1.4),
    Vk: z.number().positive().optional(), // cortante característico (kN) — habilita o check de cisalhamento
  })
  .refine((v) => v.d < alturaTotal(v.secao), { message: "d deve ser menor que a altura total da seção.", path: ["d"] });

export type EntradaFlexao = z.infer<typeof entradaSchema>;
export type EntradaFlexaoInput = z.input<typeof entradaSchema>;

/** Tipo da seção independente do schema (evita referência circular com o `.refine`). */
type SecaoViga =
  | { forma: "retangular"; b: number; h: number }
  | { forma: "T"; bf: number; hf: number; bw: number; h: number };

function alturaTotal(secao: SecaoViga): number {
  return secao.h;
}

function areaBruta(secao: SecaoViga): number {
  return secao.forma === "retangular" ? secao.b * secao.h : secao.bf * secao.hf + secao.bw * (secao.h - secao.hf);
}

/** Parâmetros do diagrama retangular e limites (NBR 6118:2023, 17.2.2 e 14.6.4.3). */
export function parametrosConcreto(fck: number): {
  lambda: number;
  alphaC: number;
  epsCU: number;
  xLimRatio: number;
} {
  if (fck <= 50) {
    return { lambda: 0.8, alphaC: 0.85, epsCU: 0.0035, xLimRatio: 0.45 };
  }
  const lambda = 0.8 - (fck - 50) / 400;
  const alphaC = 0.85 * (1 - (fck - 50) / 200);
  const epsCU = (2.6 + 35 * Math.pow((90 - fck) / 100, 4)) / 1000;
  return { lambda, alphaC, epsCU, xLimRatio: 0.35 };
}

/** ρ_mín (%) — NBR 6118:2023 Tabela 17.3 (seções retangulares), piso geométrico 0,15%. */
export function rhoMin(fck: number): number {
  const tabela: [number, number][] = [
    [20, 0.15], [25, 0.15], [30, 0.15], [35, 0.164], [40, 0.179], [45, 0.194],
    [50, 0.208], [55, 0.211], [60, 0.219], [65, 0.226], [70, 0.233], [75, 0.239],
    [80, 0.245], [85, 0.251], [90, 0.256],
  ];
  if (fck <= tabela[0][0]) return tabela[0][1];
  if (fck >= tabela[tabela.length - 1][0]) return tabela[tabela.length - 1][1];
  for (let i = 0; i < tabela.length - 1; i++) {
    const [f0, r0] = tabela[i];
    const [f1, r1] = tabela[i + 1];
    if (fck >= f0 && fck <= f1) return r0 + ((r1 - r0) * (fck - f0)) / (f1 - f0);
  }
  return 0.15;
}

type DimRet = {
  x: number;
  As: number;
  AsLinha: number;
  dupla: boolean;
  excedeSecao: boolean;
};

/**
 * Dimensiona um retângulo de largura `b` para o momento `Md` (kN·cm).
 * Retorna armadura simples ou dupla conforme o limite x/d. Usado p/ seção retangular e alma da T.
 */
function dimensionarRetangular(
  sigma: number, // αc·fcd (kN/cm²)
  b: number,
  d: number,
  dLinha: number,
  Md: number,
  lambda: number,
  xLimRatio: number,
  fyd: number,
  epsCU: number,
): DimRet {
  const xLim = xLimRatio * d;
  const M1 = sigma * b * lambda * xLim * (d - (lambda * xLim) / 2); // capacidade c/ armadura simples no limite

  if (Md <= M1 + 1e-9) {
    // Armadura simples: resolve x da equação Md = σ·b·λx·(d − λx/2).
    const A = (sigma * b * lambda * lambda) / 2;
    const B = -sigma * b * lambda * d;
    const C = Md;
    const disc = B * B - 4 * A * C;
    const x = (-B - Math.sqrt(Math.max(disc, 0))) / (2 * A);
    const As = (sigma * b * lambda * x) / fyd;
    return { x, As, AsLinha: 0, dupla: false, excedeSecao: false };
  }

  // Armadura dupla: fixa x no limite, complementa com As'/As2.
  const As1 = (sigma * b * lambda * xLim) / fyd;
  const dM = Md - M1;
  const epsLinha = epsCU * ((xLim - dLinha) / xLim); // deformação na armadura comprimida
  const sigmaLinha = Math.min(fyd, ES * Math.max(epsLinha, 0));
  const AsLinha = sigmaLinha > 0 ? dM / (sigmaLinha * (d - dLinha)) : Infinity;
  const As2 = dM / (fyd * (d - dLinha));
  return { x: xLim, As: As1 + As2, AsLinha, dupla: true, excedeSecao: false };
}

export type ResultadoFlexao = {
  md: number; // kN·cm
  x: number; // cm
  xd: number; // x/d
  xLimRatio: number;
  dominio: "2" | "3" | "4";
  As: number; // cm²
  AsLinha: number; // cm²
  AsMin: number;
  AsMax: number;
  dupla: boolean;
  tSecaoMesa: boolean; // true se LN cai dentro da mesa (T comporta-se como retangular)
  situacao: "ok" | "revisar";
  alertas: string[];
  params: { lambda: number; alphaC: number; fcd: number; fyd: number };
};

export function calcular(input: EntradaFlexaoInput): ResultadoFlexao {
  const v = entradaSchema.parse(input); // aplica defaults (gamaF=1.4, dLinha=4)
  const { lambda, alphaC, epsCU, xLimRatio } = parametrosConcreto(v.fck);
  const fcd = v.fck / 10 / 1.4; // kN/cm²
  const fyk = ACOS[v.aco];
  const fyd = fyk / 10 / 1.15; // kN/cm²
  const sigma = alphaC * fcd;
  const d = v.d;
  const Md = v.Mk * 100 * v.gamaF; // kN·cm
  const Ac = areaBruta(v.secao);
  const alertas: string[] = [];

  let As: number;
  let AsLinha: number;
  let x: number;
  let dupla: boolean;
  let tSecaoMesa = false;

  if (v.secao.forma === "retangular") {
    const r = dimensionarRetangular(sigma, v.secao.b, d, v.dLinha, Md, lambda, xLimRatio, fyd, epsCU);
    ({ x, As, AsLinha, dupla } = r);
  } else {
    const { bf, hf, bw } = v.secao;
    // Verifica se a LN cai na mesa: capacidade com bloco até hf.
    const xMesa = hf / lambda;
    const Mmesa = sigma * bf * lambda * xMesa * (d - (lambda * xMesa) / 2);
    if (Md <= Mmesa + 1e-9) {
      // Comporta-se como retangular de largura bf.
      tSecaoMesa = true;
      const r = dimensionarRetangular(sigma, bf, d, v.dLinha, Md, lambda, xLimRatio, fyd, epsCU);
      ({ x, As, AsLinha, dupla } = r);
    } else {
      // Mesa colaborante (abas) + alma.
      const Mf = sigma * (bf - bw) * hf * (d - hf / 2);
      const Asf = (sigma * (bf - bw) * hf) / fyd;
      const Mw = Md - Mf;
      const rw = dimensionarRetangular(sigma, bw, d, v.dLinha, Mw, lambda, xLimRatio, fyd, epsCU);
      x = rw.x;
      AsLinha = rw.AsLinha;
      dupla = rw.dupla;
      As = Asf + rw.As;
    }
  }

  const xd = x / d;
  const x23 = epsCU / (epsCU + 0.01); // limite domínios 2/3 (εs = 10‰)
  const dominio: "2" | "3" | "4" = xd <= x23 ? "2" : xd <= xLimRatio ? "3" : "4";

  const AsMin = (rhoMin(v.fck) / 100) * Ac;
  const AsMax = 0.04 * Ac;

  let situacao: "ok" | "revisar" = "ok";
  if (dupla) alertas.push("Seção exige armadura dupla (As'). Considere aumentar a altura para economia de aço.");
  if (As < AsMin) {
    alertas.push(`As calculado (${As.toFixed(2)} cm²) < As,mín (${AsMin.toFixed(2)} cm²): adotar As,mín.`);
  }
  if (As + AsLinha > AsMax) {
    situacao = "revisar";
    alertas.push(`As + As' (${(As + AsLinha).toFixed(2)} cm²) excede As,máx = 4% Ac (${AsMax.toFixed(2)} cm²): redimensionar a seção.`);
  }
  if (dominio === "4") {
    situacao = "revisar";
    alertas.push("Domínio 4 (ruptura frágil): aumentar a seção ou usar armadura dupla.");
  }

  return {
    md: Md,
    x,
    xd,
    xLimRatio,
    dominio,
    As: Math.max(As, 0),
    AsLinha: Number.isFinite(AsLinha) ? AsLinha : 0,
    AsMin,
    AsMax,
    dupla,
    tSecaoMesa,
    situacao,
    alertas,
    params: { lambda, alphaC, fcd, fyd },
  };
}
