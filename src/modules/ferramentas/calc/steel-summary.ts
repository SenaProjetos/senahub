/**
 * Engine E11 — Resumo / quantitativo de aço (NBR 7480).
 * Puro. Soma peso por bitola a partir de uma lista de barras (corte e dobra).
 */

import { z } from "zod";
import { massaLinear } from "./bitolas";

export const entradaSchema = z.object({
  itens: z
    .array(
      z.object({
        bitolaMm: z.number().positive(),
        quantidade: z.number().int().positive(),
        comprimentoM: z.number().positive(), // comprimento unitário (m)
        posicao: z.string().optional(), // identificação (N1, N2…)
      }),
    )
    .min(1),
  /** Perda/ponta (%) acrescida ao total. Default 10. */
  perdaPct: z.number().min(0).max(100).default(10),
});

export type EntradaResumoAco = z.infer<typeof entradaSchema>;
export type EntradaResumoAcoInput = z.input<typeof entradaSchema>;

export type LinhaBitola = {
  bitolaMm: number;
  quantidade: number;
  comprimentoTotalM: number;
  pesoKg: number;
};

export type ResultadoResumoAco = {
  porBitola: LinhaBitola[];
  pesoTotalKg: number;
  pesoComPerdaKg: number;
  perdaPct: number;
};

export function calcular(input: EntradaResumoAcoInput): ResultadoResumoAco {
  const v = entradaSchema.parse(input);
  const mapa = new Map<number, LinhaBitola>();

  for (const item of v.itens) {
    const compTotal = item.quantidade * item.comprimentoM;
    const peso = compTotal * massaLinear(item.bitolaMm);
    const atual = mapa.get(item.bitolaMm) ?? {
      bitolaMm: item.bitolaMm,
      quantidade: 0,
      comprimentoTotalM: 0,
      pesoKg: 0,
    };
    atual.quantidade += item.quantidade;
    atual.comprimentoTotalM += compTotal;
    atual.pesoKg += peso;
    mapa.set(item.bitolaMm, atual);
  }

  const porBitola = [...mapa.values()].sort((a, b) => a.bitolaMm - b.bitolaMm);
  const pesoTotalKg = porBitola.reduce((s, l) => s + l.pesoKg, 0);
  const pesoComPerdaKg = pesoTotalKg * (1 + v.perdaPct / 100);

  return { porBitola, pesoTotalKg, pesoComPerdaKg, perdaPct: v.perdaPct };
}
