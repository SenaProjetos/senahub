/**
 * Texto do resumo semanal de gestão (job de segunda 07:00, `resumoSemanal` em jobs-handlers).
 *
 * A audiência do resumo é `notificacoes:gestao`, que NÃO implica acesso ao financeiro — um
 * Coordenador recebe o resumo sem ter `financeiro:ver`. Por isso o texto é montado por
 * destinatário: os valores a receber/a pagar só entram para quem pode ver o financeiro.
 * PURO de propósito: é a regra que o teste guarda.
 */
export type ResumoSemanalDados = {
  entregas: number;
  aReceber: number;
  aPagar: number;
};

export function corpoResumoSemanal(d: ResumoSemanalDados, veFinanceiro: boolean): string {
  const entregas = `Semana: ${d.entregas} entrega(s) com prazo`;
  if (!veFinanceiro) return `${entregas}.`;
  return (
    `${entregas} · a receber R$ ${d.aReceber.toLocaleString("pt-BR")}` +
    ` · a pagar R$ ${d.aPagar.toLocaleString("pt-BR")}.`
  );
}
