/**
 * Engine E10 — Ancoragem e traspasse de barras (NBR 6118:2023, itens 9.4.2 e 9.5).
 * Puro. φ em mm; comprimentos de saída em cm; tensões em MPa.
 */

import { z } from "zod";

export const ACOS_ANC = { "CA-25": 250, "CA-50": 500, "CA-60": 600 } as const;
export type AcoAnc = keyof typeof ACOS_ANC;

export const entradaSchema = z.object({
  phiMm: z.number().positive(),
  aco: z.enum(["CA-25", "CA-50", "CA-60"]),
  fck: z.number().min(20).max(90),
  aderencia: z.enum(["boa", "ma"]),
  gancho: z.boolean().default(false),
  /** Relação As,calc/As,ef (≤1) — reduz lb,nec. Default 1. */
  razaoAs: z.number().min(0).max(1).default(1),
  /** % de barras emendadas na mesma seção (para o traspasse). Default 100. */
  pctEmendadas: z.number().min(0).max(100).default(100),
});

export type EntradaAncoragem = z.infer<typeof entradaSchema>;
export type EntradaAncoragemInput = z.input<typeof entradaSchema>;

/** η1 — conformação superficial da barra. */
function eta1(aco: AcoAnc): number {
  return aco === "CA-25" ? 1.0 : 2.25; // lisa vs nervurada
}

/** α0t — coeficiente de traspasse conforme % de barras emendadas na mesma seção (Tabela 9.4). */
function alpha0t(pct: number): number {
  if (pct <= 20) return 1.2;
  if (pct <= 25) return 1.4;
  if (pct <= 33) return 1.6;
  if (pct <= 50) return 1.8;
  return 2.0;
}

export type ResultadoAncoragem = {
  fbd: number; // MPa
  lb: number; // cm (comprimento básico)
  lbNec: number; // cm (necessário)
  lbMin: number; // cm
  l0t: number; // cm (traspasse)
  l0tMin: number; // cm
  alpha: number; // fator de gancho
  alpha0t: number;
  detalhe: { eta1: number; eta2: number; eta3: number; fctd: number; fyd: number };
};

export function calcular(input: EntradaAncoragemInput): ResultadoAncoragem {
  const v = entradaSchema.parse(input);
  const phi = v.phiMm; // mm
  const fyd = ACOS_ANC[v.aco] / 1.15; // MPa
  const fctm = v.fck <= 50 ? 0.3 * Math.pow(v.fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * v.fck);
  const fctd = (0.7 * fctm) / 1.4; // MPa

  const e1 = eta1(v.aco);
  const e2 = v.aderencia === "boa" ? 1.0 : 0.7;
  const e3 = phi < 32 ? 1.0 : (132 - phi) / 100;
  const fbd = e1 * e2 * e3 * fctd; // MPa

  // lb = (φ/4)·(fyd/fbd) — φ em mm → lb em mm → cm.
  const lbMm = (phi / 4) * (fyd / fbd);
  const lb = lbMm / 10;

  const alpha = v.gancho ? 0.7 : 1.0;
  const lbMinMm = Math.max(0.3 * lbMm, 10 * phi, 100);
  const lbNecMm = Math.max(alpha * lbMm * v.razaoAs, lbMinMm);

  const a0t = alpha0t(v.pctEmendadas);
  const l0tMm = a0t * lbNecMm;
  const l0tMinMm = Math.max(0.3 * a0t * lbMm, 15 * phi, 200);
  const l0t = Math.max(l0tMm, l0tMinMm) / 10;

  return {
    fbd,
    lb,
    lbNec: lbNecMm / 10,
    lbMin: lbMinMm / 10,
    l0t,
    l0tMin: l0tMinMm / 10,
    alpha,
    alpha0t: a0t,
    detalhe: { eta1: e1, eta2: e2, eta3: e3, fctd, fyd },
  };
}
