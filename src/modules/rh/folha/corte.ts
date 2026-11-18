/**
 * Corte da folha no Financeiro (lançamento retroativo, spec 2026-11-10 §7.3). PURO.
 *
 * As folhas de competência ANTERIOR ao corte foram lançadas no Financeiro pelo extrato do banco (salário,
 * INSS, IRRF, FGTS, bolsa e taxa do agente como despesas pagas comuns). Fechar uma delas criaria as mesmas
 * contas de novo — caixa em dobro. O corte mora em `ConfigSistema` (`CHAVE_CORTE_FOLHA`, valor JSON
 * `"YYYY-MM"`), não no código; sem a chave (ou com valor inválido) toda folha fecha como sempre.
 */

export const CHAVE_CORTE_FOLHA = "rh.folha.fechaNoFinanceiroDesde";

/** O valor da configuração, só se for uma competência `YYYY-MM` válida; qualquer outra coisa = sem corte. */
export function corteValido(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null;
}

/** Motivo para NÃO fechar a folha da `competencia` ("YYYY-MM"), ou `null` quando pode fechar. */
export function motivoCorteFolha(competencia: string, corte: string | null): string | null {
  if (!corte || competencia >= corte) return null;
  const [ano, mes] = competencia.split("-");
  return `A folha de ${mes}/${ano} foi lançada no Financeiro pelo extrato. Fechar criaria as contas em dobro.`;
}

/**
 * Motivo para NÃO reabrir uma folha fechada da `competencia`, ou `null`. Uma folha anterior ao corte que
 * fosse reaberta ficaria presa: `motivoCorteFolha` não a deixa fechar de novo.
 */
export function motivoCorteReabrir(competencia: string, corte: string | null): string | null {
  if (!corte || competencia >= corte) return null;
  const [ano, mes] = competencia.split("-");
  return `A folha de ${mes}/${ano} é anterior ao corte do Financeiro (lançada pelo extrato). Reaberta, ela não fecharia de novo.`;
}
