/**
 * Rateio de um lançamento entre centros de custo e/ou projetos (M10) — puro, sem I/O. SÓ afeta o
 * Relatório por dimensão: o `centroId`/`projetoId` do lançamento continua sendo o "principal" em
 * todo o resto do sistema (livro caixa, aging, filtros, EVM) — ver nota no schema.
 */

export type ItemRateio = {
  centroId: string | null;
  projetoId: string | null;
  percentualBp: number;
};

export const MOTIVO_RATEIO_POUCOS_ITENS = "Ratear precisa de pelo menos 2 linhas (senão não é rateio).";
export const MOTIVO_RATEIO_SEM_ALVO = "Toda linha do rateio precisa de centro de custo ou projeto (ou os dois).";
export const MOTIVO_RATEIO_PERCENTUAL_INVALIDO = "Cada linha precisa de um percentual maior que zero.";
export const MOTIVO_RATEIO_SOMA = "A soma dos percentuais precisa fechar 100%.";

/** Erro de validação do rateio, ou null se válido. */
export function validarRateio(itens: readonly ItemRateio[]): string | null {
  if (itens.length < 2) return MOTIVO_RATEIO_POUCOS_ITENS;
  if (itens.some((i) => !i.centroId && !i.projetoId)) return MOTIVO_RATEIO_SEM_ALVO;
  if (itens.some((i) => !Number.isInteger(i.percentualBp) || i.percentualBp <= 0)) return MOTIVO_RATEIO_PERCENTUAL_INVALIDO;
  const soma = itens.reduce((s, i) => s + i.percentualBp, 0);
  if (soma !== 10000) return MOTIVO_RATEIO_SOMA;
  return null;
}

export type LinhaRateada<T> = { item: ItemRateio; valor: number; extra: T };

/**
 * Divide um valor (centavos) pelos percentuais do rateio, pro-rata, com a sobra de arredondamento na
 * ÚLTIMA linha (mesma regra usada em parcelas/distribuição no resto do módulo).
 */
export function ratearValor(valorCentavos: number, itens: readonly ItemRateio[]): number[] {
  const partes = itens.map((i) => Math.floor((valorCentavos * i.percentualBp) / 10000));
  const somado = partes.reduce((s, v) => s + v, 0);
  if (partes.length > 0) partes[partes.length - 1] += valorCentavos - somado;
  return partes;
}
