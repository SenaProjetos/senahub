/**
 * Formatação pura do número de exibição da proposta (F1.2, docs/crm/04-plano-fases.md).
 * Sem I/O — não decide o sequencial, só formata. O contador em si (`PropostaSequencia`,
 * incrementado por transação em actions.ts) continua lá: é estado compartilhado, não regra.
 */

/**
 * Formata `PR-AANNNN` a partir do ano e do sequencial anual (ex.: ano=2026, sequencial=1 →
 * "PR-260001"). `ano % 100` usa só os 2 últimos dígitos — mesma convenção de sempre.
 *
 * `sequencial` >= 10000 NÃO trunca nem colide: `padStart(4, "0")` só garante um mínimo de 4
 * dígitos, então o número cresce (ex.: "PR-2610000") em vez de estourar. Documentado e testado
 * aqui de propósito — não é acidente do `padStart`.
 */
export function formatarNumeroProposta(ano: number, sequencial: number): string {
  const anoCurto = String(ano % 100).padStart(2, "0");
  const seqFormatado = String(sequencial).padStart(4, "0");
  return `PR-${anoCurto}${seqFormatado}`;
}
