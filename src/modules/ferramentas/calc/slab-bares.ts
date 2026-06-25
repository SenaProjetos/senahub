/**
 * Engine E05 — Laje maciça retangular (tabelas de Bares, NBR 6118:2023).
 * Puro. Vãos em cm, carga em kN/m², momentos em kN·m/m, armadura em cm²/m, flecha em cm.
 *
 * Momentos por tabelas de Bares (1972) adaptadas por L.M. Pinheiro (USP, 2007): Tabelas 2.3a/b/c
 * (carga uniforme, lajes armadas em cruz), 9 casos de vinculação (1, 2A, 2B, 3, 4A, 4B, 5A, 5B, 6).
 *   m = μ · p · lx² / 100      (lx = menor vão, em m)
 * Flecha elástica por Tabela 2.5a (coeficiente α, seção bruta):
 *   a = (α/100) · p · lx⁴ / (Ecs · h³)
 * Armadura por flexão simples de faixa de 1 m (ELU), com As,mín de laje (0,67·ρmín).
 *
 * Valores transcritos da referência fornecida pelo usuário. Conferência cabe ao engenheiro (ART/RRT).
 * NOTA: caso 5A, μ'x em λ=1,25 (8,81) destoa da monotonicidade da coluna — possível artefato da
 * fonte; conferir contra a tabela impressa antes de usar λ próximo de 1,25 no caso 5A.
 */

import { z } from "zod";
import { parametrosConcreto, ACOS } from "./concrete-beam-flexure";
import { moduloSecante } from "./concrete-beam-deflection";

const ES = 21000; // kN/cm² (210 GPa)

export const CASOS = {
  "1": "Caso 1 — 4 bordas apoiadas",
  "2A": "Caso 2A — 1 borda engastada (maior)",
  "2B": "Caso 2B — 1 borda engastada (menor)",
  "3": "Caso 3 — 2 bordas adjacentes engastadas",
  "4A": "Caso 4A — 2 bordas maiores engastadas",
  "4B": "Caso 4B — 2 bordas menores engastadas",
  "5A": "Caso 5A — 3 engastadas, 1 apoiada (menor livre)",
  "5B": "Caso 5B — 3 engastadas, 1 apoiada (maior livre)",
  "6": "Caso 6 — 4 bordas engastadas",
} as const;
export type CasoLaje = keyof typeof CASOS;

/** λ da tabela: 1,00 a 2,00 em passos de 0,05 (21 pontos). */
const LAMBDAS = Array.from({ length: 21 }, (_, i) => 1 + i * 0.05);

type ColunasMomento = { mx: number[]; mlx?: number[]; my?: number[]; mly?: number[] };
type LinhaMaior = { mx: number; mlx?: number; my?: number; mly?: number };

/** Coeficientes de momento por caso (μ·100). mlx=μ'x, mly=μ'y. `maior` = linha ">2,00". */
const MOMENTO: Record<CasoLaje, ColunasMomento & { maior: LinhaMaior }> = {
  "1": {
    mx: [4.23, 4.62, 5.0, 5.38, 5.75, 6.1, 6.44, 6.77, 7.1, 7.41, 7.72, 7.99, 8.26, 8.5, 8.74, 8.95, 9.16, 9.35, 9.54, 9.73, 9.91],
    my: [4.23, 4.25, 4.27, 4.25, 4.22, 4.17, 4.12, 4.06, 4.0, 3.95, 3.89, 3.82, 3.74, 3.66, 3.58, 3.53, 3.47, 3.38, 3.29, 3.23, 3.16],
    maior: { mx: 12.5, my: 3.16 },
  },
  "2A": {
    mx: [2.91, 3.26, 3.61, 3.98, 4.35, 4.72, 5.09, 5.44, 5.79, 6.12, 6.45, 6.76, 7.07, 7.28, 7.49, 7.53, 7.56, 8.1, 8.63, 8.86, 9.08],
    my: [3.54, 3.64, 3.74, 3.8, 3.86, 3.89, 3.92, 3.93, 3.94, 3.91, 3.88, 3.85, 3.81, 3.78, 3.74, 3.69, 3.63, 3.58, 3.53, 3.45, 3.36],
    mly: [8.4, 8.79, 9.18, 9.53, 9.88, 10.16, 10.41, 10.64, 10.86, 11.05, 11.23, 11.39, 11.55, 11.67, 11.79, 11.88, 11.96, 12.05, 12.14, 12.17, 12.2],
    maior: { mx: 12.5, my: 3.36, mly: 12.2 },
  },
  "2B": {
    mx: [3.54, 3.77, 3.99, 4.19, 4.38, 4.55, 4.71, 4.86, 5.0, 5.12, 5.24, 5.34, 5.44, 5.53, 5.61, 5.68, 5.75, 5.81, 5.86, 5.9, 5.94],
    mlx: [8.4, 8.79, 9.17, 9.49, 9.8, 10.06, 10.32, 10.54, 10.75, 10.92, 11.09, 11.23, 11.36, 11.48, 11.6, 11.72, 11.84, 11.94, 12.03, 12.08, 12.13],
    my: [2.91, 2.84, 2.76, 2.68, 2.59, 2.51, 2.42, 2.34, 2.25, 2.19, 2.12, 2.04, 1.95, 1.87, 1.79, 1.74, 1.68, 1.67, 1.59, 1.54, 1.48],
    maior: { mx: 7.03, mlx: 12.5, my: 1.48 },
  },
  "3": {
    mx: [2.69, 2.94, 3.19, 3.42, 3.65, 3.86, 4.06, 4.24, 4.42, 4.58, 4.73, 4.86, 4.99, 5.1, 5.21, 5.31, 5.4, 5.48, 5.56, 5.63, 5.7],
    mlx: [6.99, 7.43, 7.87, 8.28, 8.69, 9.03, 9.37, 9.65, 9.93, 10.17, 10.41, 10.62, 10.82, 10.99, 11.16, 11.3, 11.43, 11.55, 11.67, 11.78, 11.89],
    my: [2.69, 2.68, 2.67, 2.65, 2.62, 2.56, 2.5, 2.45, 2.39, 2.32, 2.25, 2.16, 2.07, 1.99, 1.91, 1.85, 1.78, 1.72, 1.66, 1.63, 1.6],
    mly: [6.99, 7.18, 7.36, 7.5, 7.63, 7.72, 7.81, 7.88, 7.94, 8.0, 8.06, 8.09, 8.12, 8.14, 8.15, 8.16, 8.17, 8.17, 8.18, 8.19, 8.2],
    maior: { mx: 7.03, mlx: 12.5, my: 1.6, mly: 8.2 },
  },
  "4A": {
    mx: [2.01, 2.32, 2.63, 2.93, 3.22, 3.63, 3.99, 4.34, 4.69, 5.03, 5.37, 5.7, 6.03, 6.35, 6.67, 6.97, 7.27, 7.55, 7.82, 8.09, 8.35],
    my: [3.09, 3.23, 3.36, 3.46, 3.56, 3.64, 3.72, 3.77, 3.82, 3.86, 3.9, 3.9, 3.89, 3.85, 3.81, 3.79, 3.76, 3.72, 3.67, 3.6, 3.52],
    mly: [6.99, 7.43, 7.87, 8.26, 8.65, 9.03, 9.33, 9.69, 10.0, 10.25, 10.49, 10.7, 10.91, 11.08, 11.24, 11.39, 11.53, 11.65, 11.77, 11.83, 11.88],
    maior: { mx: 12.5, my: 3.52, mly: 11.88 },
  },
  "4B": {
    mx: [3.09, 3.22, 3.35, 3.46, 3.57, 3.66, 3.74, 3.8, 3.86, 3.91, 3.96, 4.0, 4.04, 4.07, 4.1, 4.12, 4.14, 4.15, 4.16, 4.16, 4.17],
    mlx: [6.99, 7.2, 7.41, 7.56, 7.7, 7.82, 7.93, 8.02, 8.11, 8.13, 8.15, 8.2, 8.25, 8.28, 8.3, 8.31, 8.32, 8.33, 8.33, 8.33, 8.33],
    my: [2.01, 1.92, 1.83, 1.73, 1.63, 1.56, 1.49, 1.41, 1.33, 1.26, 1.19, 1.14, 1.08, 1.03, 0.98, 0.95, 0.91, 0.87, 0.83, 0.8, 0.76],
    maior: { mx: 4.17, mlx: 8.33, my: 0.76 },
  },
  "5A": {
    mx: [2.02, 2.27, 2.52, 2.76, 3.0, 3.23, 3.45, 3.66, 3.86, 4.05, 4.23, 4.39, 4.55, 4.7, 4.84, 4.97, 5.1, 5.2, 5.3, 5.4, 5.5],
    // λ=1,25 (8,81) destoa da coluna — ver NOTA no cabeçalho.
    mlx: [5.46, 5.98, 6.5, 7.11, 7.72, 8.81, 8.59, 8.74, 8.88, 9.16, 9.44, 9.68, 9.91, 10.13, 10.34, 10.53, 10.71, 10.88, 11.04, 11.2, 11.35],
    my: [2.52, 2.56, 2.6, 2.63, 2.65, 2.64, 2.61, 2.57, 2.53, 2.48, 2.43, 2.39, 2.34, 2.28, 2.22, 2.15, 2.08, 2.02, 1.96, 1.88, 1.8],
    mly: [6.17, 6.46, 6.75, 6.97, 7.19, 7.36, 7.51, 7.63, 7.74, 7.83, 7.91, 7.98, 8.02, 8.03, 8.1, 8.13, 8.17, 8.16, 8.14, 8.13, 8.12],
    maior: { mx: 7.03, mlx: 12.5, my: 1.8, mly: 8.12 },
  },
  "5B": {
    mx: [2.52, 2.7, 2.87, 3.02, 3.16, 3.28, 3.4, 3.5, 3.59, 3.67, 3.74, 3.8, 3.86, 3.91, 3.95, 3.99, 4.02, 4.05, 4.08, 4.1, 4.12],
    mlx: [6.17, 6.47, 6.76, 6.99, 7.22, 7.4, 7.57, 7.7, 7.82, 7.91, 8.0, 8.07, 8.14, 8.2, 8.25, 8.3, 8.34, 8.38, 8.42, 8.45, 8.47],
    my: [2.02, 1.97, 1.91, 1.84, 1.77, 1.7, 1.62, 1.55, 1.47, 1.41, 1.35, 1.29, 1.23, 1.18, 1.13, 1.07, 1.0, 0.97, 0.94, 0.91, 0.88],
    mly: [5.46, 5.56, 5.65, 5.7, 5.75, 5.75, 5.76, 5.75, 5.74, 5.73, 5.72, 5.69, 5.66, 5.62, 5.58, 5.56, 5.54, 5.55, 5.56, 5.6, 5.64],
    maior: { mx: 4.17, mlx: 8.33, my: 0.88, mly: 5.64 },
  },
  "6": {
    mx: [2.02, 2.22, 2.42, 2.65, 2.87, 2.97, 3.06, 3.19, 3.32, 3.43, 3.53, 3.61, 3.69, 3.76, 3.83, 3.88, 3.92, 3.96, 3.99, 4.02, 4.05],
    mlx: [5.15, 5.5, 5.85, 6.14, 6.43, 6.67, 6.9, 7.09, 7.28, 7.43, 7.57, 7.68, 7.79, 7.88, 7.97, 8.05, 8.12, 8.18, 8.24, 8.29, 8.33],
    my: [2.02, 2.0, 1.98, 1.94, 1.89, 1.83, 1.77, 1.71, 1.65, 1.57, 1.49, 1.43, 1.36, 1.29, 1.21, 1.17, 1.13, 1.07, 1.01, 0.99, 0.96],
    mly: [5.15, 5.29, 5.43, 5.51, 5.59, 5.64, 5.68, 5.69, 5.7, 5.71, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72, 5.72],
    maior: { mx: 4.17, mlx: 8.33, my: 0.96, mly: 5.72 },
  },
};

/** Coeficiente α de flecha (Tabela 2.5a), λ 1,00..2,00; `inf` = λ→∞. */
const FLECHA: Record<CasoLaje, { alpha: number[]; inf: number }> = {
  "1": { alpha: [4.76, 5.26, 5.74, 6.2, 6.64, 7.08, 7.49, 7.9, 8.29, 8.67, 9.03, 9.39, 9.71, 10.04, 10.34, 10.62, 10.91, 11.16, 11.41, 11.65, 11.89], inf: 15.63 },
  "2A": { alpha: [3.26, 3.68, 4.11, 4.55, 5.0, 5.44, 5.88, 6.32, 6.74, 7.15, 7.55, 7.95, 8.32, 8.68, 9.03, 9.36, 9.69, 10.0, 10.29, 10.58, 10.87], inf: 15.63 },
  "2B": { alpha: [3.26, 3.48, 3.7, 3.89, 4.09, 4.26, 4.43, 4.58, 4.73, 4.87, 5.01, 5.09, 5.18, 5.22, 5.26, 5.36, 5.46, 5.53, 5.6, 5.68, 5.76], inf: 6.5 },
  "3": { alpha: [2.46, 2.72, 2.96, 3.18, 3.4, 3.61, 3.8, 3.99, 4.15, 4.31, 4.46, 4.61, 4.73, 4.86, 4.97, 5.06, 5.16, 5.25, 5.33, 5.41, 5.49], inf: 6.5 },
  "4A": { alpha: [2.25, 2.6, 2.97, 3.35, 3.74, 4.14, 4.56, 5.01, 5.41, 5.83, 6.25, 6.66, 7.06, 7.46, 7.84, 8.21, 8.58, 8.93, 9.25, 9.58, 9.9], inf: 15.63 },
  "4B": { alpha: [2.25, 2.35, 2.45, 2.53, 2.61, 2.68, 2.74, 2.77, 2.8, 2.85, 2.89, 2.91, 2.92, 2.92, 2.93, 2.93, 2.94, 2.94, 2.95, 2.95, 2.96], inf: 3.13 },
  "5A": { alpha: [1.84, 2.08, 2.31, 2.54, 2.77, 3.0, 3.22, 3.42, 3.62, 3.8, 3.98, 4.14, 4.3, 4.45, 4.59, 4.71, 4.84, 4.96, 5.07, 5.17, 5.28], inf: 6.5 },
  "5B": { alpha: [1.84, 1.96, 2.08, 2.18, 2.28, 2.37, 2.46, 2.53, 2.61, 2.67, 2.73, 2.78, 2.82, 2.83, 2.84, 2.86, 2.88, 2.9, 2.92, 2.94, 2.96], inf: 3.13 },
  "6": { alpha: [1.49, 1.63, 1.77, 1.9, 2.02, 2.14, 2.24, 2.34, 2.41, 2.49, 2.56, 2.62, 2.68, 2.73, 2.77, 2.81, 2.85, 2.88, 2.9, 2.93, 2.96], inf: 3.13 },
};

/** Interpola linearmente em LAMBDAS (1,00..2,00). Fora da faixa, usa extremo. */
function interp(col: number[], lambda: number): number {
  if (lambda <= LAMBDAS[0]) return col[0];
  if (lambda >= LAMBDAS[LAMBDAS.length - 1]) return col[col.length - 1];
  for (let i = 0; i < LAMBDAS.length - 1; i++) {
    if (lambda >= LAMBDAS[i] && lambda <= LAMBDAS[i + 1]) {
      const t = (lambda - LAMBDAS[i]) / (LAMBDAS[i + 1] - LAMBDAS[i]);
      return col[i] + t * (col[i + 1] - col[i]);
    }
  }
  return col[col.length - 1];
}

export const entradaSchema = z.object({
  caso: z.enum(Object.keys(CASOS) as [CasoLaje, ...CasoLaje[]]),
  lx: z.number().positive(), // cm — menor vão (ou qualquer; o engine usa min)
  ly: z.number().positive(), // cm — maior vão
  h: z.number().positive(), // cm — espessura
  p: z.number().positive(), // kN/m² — carga total característica (ELU via γf)
  pServ: z.number().positive().optional(), // kN/m² — carga de serviço p/ flecha (default = p)
  fck: z.number().min(20).max(90),
  aco: z.enum(["CA-25", "CA-50", "CA-60"]),
  dLinha: z.number().positive().default(2.5), // cm — cobrimento ao CG das barras
  gamaF: z.number().positive().default(1.4),
  alphaE: z.number().positive().default(1.0), // agregado (1,0 granito/gnaisse)
  alphaF: z.number().min(0).default(1.32), // fator de fluência (flecha diferida)
});

export type EntradaLaje = z.infer<typeof entradaSchema>;
export type EntradaLajeInput = z.input<typeof entradaSchema>;

export type MomentoLaje = { simbolo: string; m: number; as: number };

export type ResultadoLaje = {
  lambda: number;
  lxMenor: number; // cm
  umaDirecao: boolean; // λ > 2
  momentos: MomentoLaje[];
  asMin: number; // cm²/m
  ecs: number; // MPa
  // Fissuração (estádio II, Branson) na direção de menor vão:
  ic: number; // cm⁴ (inércia bruta da faixa de 1 m)
  mr: number; // kN·m/m (momento de fissuração)
  maServ: number; // kN·m/m (momento de serviço, dir. lx)
  iII: number; // cm⁴ (inércia fissurada)
  ieq: number; // cm⁴ (Branson)
  fissura: boolean;
  flechaImediataBruta: number; // cm (seção bruta, Tabela de Bares)
  flechaImediata: number; // cm (corrigida pela fissuração: ×Ic/Ieq)
  flechaTotal: number; // cm (imediata fissurada × (1+αf))
  flechaLimite: number; // cm (lx/250)
  alertas: string[];
};

/** Inércia no estádio II (faixa de 1 m, armadura simples) — LN e I_II transformados. */
function inerciaEstadioII(as: number, d: number, alphaE: number): { xII: number; iII: number } {
  const b = 100;
  // (b/2)x² + αe·As·x − αe·As·d = 0
  const aAs = alphaE * as;
  const xII = (-aAs + Math.sqrt(aAs * aAs + 2 * b * aAs * d)) / b;
  const iII = (b * xII ** 3) / 3 + aAs * (d - xII) ** 2;
  return { xII, iII };
}

/** Armadura de flexão simples por faixa de 1 m. Md em kN·cm; retorna As (cm²/m) e x/d. */
function armaduraFaixa(
  mKNm: number,
  d: number,
  fck: number,
  fyd: number,
  gamaF: number,
): { as: number; xd: number; excede: boolean } {
  const p = parametrosConcreto(fck);
  const sigma = p.alphaC * (fck / 10 / 1.4); // kN/cm²
  const b = 100; // faixa de 1 m
  const Md = gamaF * mKNm * 100; // kN·cm
  const A = (sigma * b * p.lambda * p.lambda) / 2;
  const B = -sigma * b * p.lambda * d;
  const disc = B * B - 4 * A * Md;
  if (disc < 0) return { as: Infinity, xd: Infinity, excede: true };
  const x = (-B - Math.sqrt(disc)) / (2 * A);
  const as = (sigma * b * p.lambda * x) / fyd;
  return { as, xd: x / d, excede: x / d > p.xLimRatio };
}

export function calcular(input: EntradaLajeInput): ResultadoLaje {
  const v = entradaSchema.parse(input);
  const lx = Math.min(v.lx, v.ly);
  const ly = Math.max(v.lx, v.ly);
  const lambda = ly / lx;
  const lxM = lx / 100; // m
  const umaDirecao = lambda > 2;
  const alertas: string[] = [];
  if (umaDirecao) alertas.push("λ > 2: comporta-se como laje armada em uma direção — coeficientes da linha \">2,00\".");

  const tab = MOMENTO[v.caso];
  const coef = (col: number[] | undefined, maiorVal: number | undefined): number | undefined => {
    if (!col) return undefined;
    return umaDirecao ? maiorVal : interp(col, lambda);
  };

  const fyd = ACOS[v.aco] / 10 / 1.15; // kN/cm²
  const d = v.h - v.dLinha;
  const fator = (v.p * lxM * lxM) / 100; // p·lx²/100

  const momentos: MomentoLaje[] = [];
  const addMomento = (simbolo: string, mu: number | undefined) => {
    if (mu == null) return;
    const m = mu * fator; // kN·m/m
    const arm = armaduraFaixa(m, d, v.fck, fyd, v.gamaF);
    if (arm.excede) alertas.push(`${simbolo}: x/d excede o limite de ductilidade — aumentar a espessura.`);
    momentos.push({ simbolo, m, as: arm.as });
  };
  addMomento("Mx", coef(tab.mx, tab.maior.mx));
  addMomento("M'x", coef(tab.mlx, tab.maior.mlx));
  addMomento("My", coef(tab.my, tab.maior.my));
  addMomento("M'y", coef(tab.mly, tab.maior.mly));

  // As,mín de laje armada em cruz: 0,67·ρmín (NBR 6118 Tabela 19.1).
  const asMin = asMinLaje(v.fck, v.h);
  for (const mo of momentos) mo.as = Math.max(mo.as, asMin);

  // Flecha elástica bruta (Tabela 2.5a): a = (α/100)·p·lx⁴/(Ecs·h³).
  const fl = FLECHA[v.caso];
  const alpha = umaDirecao ? fl.inf : interp(fl.alpha, lambda);
  const ecs = moduloSecante(v.fck, v.alphaE); // MPa
  const ecsKNm2 = ecs * 1000; // kN/m²
  const pServ = v.pServ ?? v.p;
  const hM = v.h / 100;
  const flechaImediataBruta = ((alpha / 100) * (pServ * Math.pow(lxM, 4))) / (ecsKNm2 * Math.pow(hM, 3)) * 100; // cm

  // Fissuração (estádio II, Branson) na direção de menor vão (lx → Mx positivo).
  const ic = (100 * v.h ** 3) / 12; // cm⁴ (faixa de 1 m)
  const fctm = (v.fck <= 50 ? 0.3 * Math.pow(v.fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * v.fck)) / 10; // kN/cm²
  const mr = (1.5 * fctm * ic) / (v.h / 2) / 100; // kN·m/m
  const muMx = coef(tab.mx, tab.maior.mx) ?? 0;
  const maServ = muMx * ((pServ * lxM * lxM) / 100); // kN·m/m (serviço, dir. lx)
  const asMx = momentos.find((m) => m.simbolo === "Mx")?.as ?? asMin;
  const alphaEs = ES / (ecs / 10); // Es/Ecs (Ecs em kN/cm²)
  const { iII } = inerciaEstadioII(asMx, d, alphaEs);
  const fissura = maServ > mr;
  const razao = maServ > 0 ? Math.min(mr / maServ, 1) : 1;
  const ieq = fissura ? Math.min(razao ** 3 * ic + (1 - razao ** 3) * iII, ic) : ic;

  const flechaImediata = flechaImediataBruta * (ic / ieq);
  const flechaTotal = flechaImediata * (1 + v.alphaF);
  const flechaLimite = lx / 250; // cm
  if (fissura) alertas.push(`Seção fissurada (Ma=${maServ.toFixed(2)} > Mr=${mr.toFixed(2)} kN·m/m): flecha corrigida por Branson (Ieq).`);
  if (flechaTotal > flechaLimite) alertas.push(`Flecha total (${flechaTotal.toFixed(2)} cm) excede o limite L/250 (${flechaLimite.toFixed(2)} cm).`);

  return {
    lambda,
    lxMenor: lx,
    umaDirecao,
    momentos,
    asMin,
    ecs,
    ic,
    mr,
    maServ,
    iII,
    ieq,
    fissura,
    flechaImediataBruta,
    flechaImediata,
    flechaTotal,
    flechaLimite,
    alertas,
  };
}

/** As,mín de laje armada em duas direções (positiva) = 0,67·ρmín·Ac (NBR 6118 Tab. 19.1 + 17.3). */
export function asMinLaje(fck: number, h: number): number {
  // ρmín (%) da Tabela 17.3 (mesma da viga); laje em cruz usa 0,67·ρmín.
  const tabela: [number, number][] = [
    [20, 0.15], [25, 0.15], [30, 0.15], [35, 0.164], [40, 0.179], [45, 0.194],
    [50, 0.208], [55, 0.211], [60, 0.219], [65, 0.226], [70, 0.233], [75, 0.239],
    [80, 0.245], [85, 0.251], [90, 0.256],
  ];
  let rho = 0.15;
  if (fck <= tabela[0][0]) rho = tabela[0][1];
  else if (fck >= tabela[tabela.length - 1][0]) rho = tabela[tabela.length - 1][1];
  else {
    for (let i = 0; i < tabela.length - 1; i++) {
      const [f0, r0] = tabela[i];
      const [f1, r1] = tabela[i + 1];
      if (fck >= f0 && fck <= f1) { rho = r0 + ((r1 - r0) * (fck - f0)) / (f1 - f0); break; }
    }
  }
  return 0.67 * (rho / 100) * (100 * h); // cm²/m (faixa de 1 m)
}
