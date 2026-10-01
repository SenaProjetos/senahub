/**
 * Retiradas de sócio (F6B): divisão de uma distribuição de lucros pelo percentual de cada sócio.
 * Puro — a mesma conta na prévia da tela e na hora de gravar. Centavos inteiros; percentual em
 * basis points (10000 = 100%), então 100% fecha exato.
 *
 * Distribuição de lucros e adiantamento são `fora_do_resultado` (ADR-0008): saem do caixa e aparecem
 * no DFC como financiamento, mas NÃO são despesa na DRE. Pró-labore é outra coisa: é despesa (2.08).
 */
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";

export const BP_TOTAL = 10_000;

export type SocioParaRateio = { id: string; nome: string; percentualBp: number };
export type ParteDoSocio = { socioId: string; nome: string; percentualBp: number; valor: Centavos };

/** `Socio.percentual` é Decimal(5,2) em PONTOS percentuais: 33,33 → 3333 bp. */
export function percentualParaBp(percentual: number): number {
  return Math.round(percentual * 100);
}

export function somaBp(socios: readonly SocioParaRateio[]): number {
  return socios.reduce((s, x) => s + x.percentualBp, 0);
}

export function bpParaTexto(bp: number): string {
  const p = bp / 100;
  return `${Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0$/, "").replace(".", ",")}%`;
}

/**
 * Motivo de a divisão não poder ser feita (`null` = pode). Os percentuais dos sócios ATIVOS precisam
 * fechar 100%: normalizar em silêncio esconderia um cadastro errado, e o total da tela de Sócios já
 * mostra a soma.
 */
export function motivoDoRateio(socios: readonly SocioParaRateio[]): string | null {
  if (socios.length === 0) return "Nenhum sócio ativo cadastrado.";
  if (socios.some((s) => s.percentualBp <= 0)) return "Todo sócio ativo precisa de um percentual maior que zero.";
  const soma = somaBp(socios);
  if (soma !== BP_TOTAL) return `Os percentuais dos sócios ativos somam ${bpParaTexto(soma)}: ajuste para 100% em Cadastros → Sócios.`;
  return null;
}

/**
 * Parte de cada sócio: piso de `total × bp / 10000`, e o último leva o resto — a soma fecha o total
 * exato, sem centavo perdido nem sobrando.
 */
export function ratearEntreSocios(total: Centavos, socios: readonly SocioParaRateio[]): ParteDoSocio[] {
  if (motivoDoRateio(socios) !== null || !Number.isInteger(total) || total <= 0) return [];
  let usado = 0;
  return socios.map((s, k) => {
    const valor = k === socios.length - 1 ? total - usado : Math.floor((total * s.percentualBp) / BP_TOTAL);
    usado += valor;
    return { socioId: s.id, nome: s.nome, percentualBp: s.percentualBp, valor };
  });
}

/** Descrição de cada lançamento: "Distribuição de lucros · Ana" / "Adiantamento de lucros · Ana". */
export function descricaoDaRetirada(tipo: "distribuicao" | "adiantamento", nome: string): string {
  return `${tipo === "distribuicao" ? "Distribuição de lucros" : "Adiantamento de lucros"} · ${nome}`;
}
