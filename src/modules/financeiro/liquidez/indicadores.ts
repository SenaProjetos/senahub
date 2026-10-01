/**
 * Indicadores derivados (spec §13). Puro. Nenhum devolve `NaN` ou `Infinity`: o que não dá para
 * calcular vira um estado com motivo.
 */
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

export const HISTORICO_MINIMO_DIAS = 30;
export const JANELA_DIAS_DE_CAIXA = 90;

export type DiasDeCaixa =
  | { tipo: "dias"; dias: number; maisDe365: boolean }
  | { tipo: "zero" }
  | { tipo: "indisponivel"; motivo: string };

/**
 * Por quantos dias o CAIXA ATUAL cobre a média histórica de saídas (despesas de natureza resultado
 * dos últimos 90 dias). Não é "por quantos dias o dinheiro livre cobre as saídas": as caixinhas
 * existem para pagar parte dessas saídas, e dividir o livre contaria a mesma saída duas vezes.
 */
export function diasDeCaixa(p: { caixaAtual: Centavos; saidasNaJanela: Centavos; diasDeHistorico: number }): DiasDeCaixa {
  if (p.caixaAtual <= 0) return { tipo: "zero" };
  if (!(p.diasDeHistorico >= HISTORICO_MINIMO_DIAS)) {
    return { tipo: "indisponivel", motivo: "Histórico insuficiente (menos de 30 dias)." };
  }
  if (!(p.saidasNaJanela > 0)) return { tipo: "indisponivel", motivo: "Sem saídas nos últimos 90 dias." };
  const dias = Math.floor((p.caixaAtual * JANELA_DIAS_DE_CAIXA) / p.saidasNaJanela);
  return dias > 365 ? { tipo: "dias", dias: 365, maisDe365: true } : { tipo: "dias", dias, maisDe365: false };
}

/** Quanto do caixa do dia o movimento representa, em %, com uma casa. `null` se o caixa ≤ 0. */
export function impactoPercentual(valor: Centavos, caixaAntes: Centavos): number | null {
  if (!(caixaAntes > 0)) return null;
  return Math.round((valor / caixaAntes) * 1000) / 10;
}

export type Necessidade = { dia: DataIso; valor: Centavos };

/**
 * Quanto precisa entrar a mais para o saldo não ficar abaixo da reserva mínima. É acumulado por
 * data: o que entra antes do primeiro rompimento também cobre os seguintes. Devolve o primeiro
 * rompimento (data e falta naquele dia) e o total (maior falta, na data em que acontece).
 */
export function necessidadeParaReserva(
  serie: readonly { dia: DataIso; saldo: Centavos }[],
  reservaMinima: Centavos,
): { primeiro: Necessidade | null; total: Necessidade | null } {
  let primeiro: Necessidade | null = null;
  let total: Necessidade | null = null;
  for (const d of serie) {
    const falta = reservaMinima - d.saldo;
    if (falta <= 0) continue;
    if (!primeiro) primeiro = { dia: d.dia, valor: falta };
    if (!total || falta > total.valor) total = { dia: d.dia, valor: falta };
  }
  return { primeiro, total };
}
