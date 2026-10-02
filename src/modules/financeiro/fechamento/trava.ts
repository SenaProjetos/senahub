/**
 * Trava do período fechado (N5 do núcleo do Financeiro). Pura, sem I/O.
 *
 * Fechar o mês gerava o relatório e não travava nada: um lançamento do mês fechado continuava
 * editável, e o número que foi para o contador mudava depois sem ninguém saber. Agora o mês fechado
 * congela o que foi fechado — o caixa do mês (data de pagamento) e a competência (data de competência,
 * ou a data do lançamento):
 *
 * - criar, editar valor/categoria/datas/conta/centro/projeto, cancelar, reabrir e excluir olham a
 *   competência (e o pagamento, se pago);
 * - baixar e conciliar olham só a NOVA data de pagamento — conta vencida de mês fechado continua pagável
 *   num mês aberto (o pagamento não mexe no mês fechado);
 * - estornar olha a data do pagamento que sai;
 * - importar e desfazer importação olham as datas das linhas.
 *
 * Quem tem `financeiro:fechar` reabre o mês em Fechamento mensal e mexe.
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** `YYYY-MM` de uma data-calendário (meia-noite UTC do banco ou `YYYY-MM-DD`). */
export function mesDe(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "string") return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null;
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 7);
}

export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

/** Por que a operação não pode tocar estas datas; `null` = nenhum mês fechado no meio. */
export function motivoPeriodoFechado(
  datas: readonly (Date | string | null | undefined)[],
  mesesFechados: ReadonlySet<string>,
): string | null {
  const fechados = [...new Set(datas.map(mesDe).filter((m): m is string => m != null && mesesFechados.has(m)))].sort();
  if (fechados.length === 0) return null;
  const lista = fechados.map(rotuloDoMes);
  const quais = lista.length === 1 ? `${lista[0]} está fechado` : `${lista.slice(0, -1).join(", ")} e ${lista.at(-1)} estão fechados`;
  return `${quais[0].toUpperCase()}${quais.slice(1)}: reabra o mês em Fechamento mensal antes de mexer nos lançamentos dele.`;
}

/** Campos que mudam o que o mês fechado mostrou (resultado, caixa, rentabilidade). */
export const CAMPOS_TRAVADOS = ["valor", "categoriaId", "data", "dataCompetencia", "contaId", "centroId", "projetoId"] as const;

/** A edição mexe em algum campo travado? (descrição, vencimento, observação, contato e planejador, não) */
export function edicaoMexeNoFechado(
  antes: Partial<Record<(typeof CAMPOS_TRAVADOS)[number], unknown>>,
  depois: Partial<Record<(typeof CAMPOS_TRAVADOS)[number], unknown>>,
): boolean {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null || v === "" ? null : String(v));
  return CAMPOS_TRAVADOS.some((c) => c in depois && norm(antes[c]) !== norm(depois[c]));
}
