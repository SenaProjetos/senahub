/** Dinheiro em centavos inteiros (puro): o motor nunca soma reais em ponto flutuante. */
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";

/** Converte reais (número, string ou `Decimal` do Prisma) em centavos inteiros. */
export function paraCentavos(reais: number | string | { toString(): string }): Centavos {
  const n = typeof reais === "number" ? reais : Number(reais.toString());
  if (!Number.isFinite(n)) throw new Error(`Valor inválido para centavos: ${String(reais)}`);
  return Math.round(n * 100);
}

export function paraReais(c: Centavos): number {
  return c / 100;
}

/** `R$ 1.234,56` (sinal "−" tipográfico quando negativo), para avisos do motor. */
export function formatarCentavos(c: Centavos): string {
  const abs = Math.abs(c);
  const reais = Math.floor(abs / 100).toLocaleString("pt-BR");
  const cent = String(abs % 100).padStart(2, "0");
  return `${c < 0 ? "−" : ""}R$ ${reais},${cent}`;
}
