/**
 * Frescor da prospecção/negociação (F2.9): há quantos dias ninguém fala com a empresa, se o
 * follow-up venceu, e se a próxima ação é hoje ou ainda está no futuro.
 *
 * **Puro e com relógio injetado.** Nenhuma função aqui chama `new Date()` sem argumento — o
 * "agora" entra sempre por parâmetro, mesmo padrão de `saudeProjeto(..., agora)` em
 * `modules/projetos/health.ts`. É o que torna a virada de dia testável em vez de ser aquela
 * classe de bug que só aparece às 23h de uma sexta.
 *
 * ── Sobre o fuso ────────────────────────────────────────────────────────────────────────────
 * O backlog especifica **America/Recife** para esta tarefa, e é o fuso do escritório. O resto do
 * código (`ponto/engine.ts`, `lib/jobs.ts`, `lib/backup.ts`) usa **America/Sao_Paulo**.
 *
 * Hoje os dois são idênticos: ambos UTC-3 fixo, sem horário de verão — o Brasil aboliu o DST em
 * 2019 e Pernambuco nunca o adotou nem antes disso. A escolha só passaria a importar se o horário
 * de verão voltasse, e aí Recife (que ficaria de fora, como sempre ficou) seria o fuso CERTO para
 * o escritório, enquanto São Paulo passaria a adiantar uma hora no verão.
 *
 * Fica em Recife por ser o que a tarefa pede e o que descreve a operação real. Divergência
 * registrada aqui de propósito: se alguém um dia unificar os fusos do sistema, precisa saber que
 * este não é um descuido de copiar-e-colar.
 *
 * Nunca use `getDay()`/`getHours()`/`toISOString()` direto: o servidor é Windows e pode estar em
 * qualquer fuso — a comparação tem que passar por `Intl` com `timeZone` explícito.
 */

const TZ = "America/Recife";

const FMT_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia local `YYYY-MM-DD` no fuso do escritório. */
export function diaLocal(d: Date): string {
  return FMT_DIA.format(d);
}

/** Dia da semana no fuso local: 0=domingo … 6=sábado. */
export function diaSemanaLocal(d: Date): number {
  const [y, m, dia] = diaLocal(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dia)).getUTCDay();
}

/** Sábado ou domingo no fuso local. */
export function ehFimDeSemana(d: Date): boolean {
  const dow = diaSemanaLocal(d);
  return dow === 0 || dow === 6;
}

/** Diferença em DIAS DE CALENDÁRIO local — não em blocos de 24h. */
function diasEntre(de: string, ate: string): number {
  const a = new Date(`${de}T00:00:00.000Z`).getTime();
  const b = new Date(`${ate}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Dias corridos desde a última interação, contados por **dia de calendário local**.
 *
 * Contar calendário em vez de horas é deliberado: uma interação às 23h de ontem tem "1 dia" hoje
 * às 8h, não "zero dias" — é assim que a pessoa que vende enxerga, e é o que faz o número bater
 * com o que ela lembra. Contar 24h em 24h produziria "0 dia" numa conversa de ontem à noite.
 *
 * `null` (nunca houve interação) devolve `null`, não zero: "nunca falamos" e "falamos hoje" são
 * estados diferentes, e zero faria a lista de abandono esconder justamente quem nunca foi
 * contatado.
 */
export function diasSemInteracao(ultima: Date | null | undefined, agora: Date): number | null {
  if (!ultima) return null;
  return diasEntre(diaLocal(ultima), diaLocal(agora));
}

/**
 * O follow-up venceu? Vence quando a data marcada é ANTERIOR ao dia de hoje — o dia inteiro da
 * data marcada ainda conta como "no prazo", até 23:59:59 local.
 */
export function followUpAtrasado(prevista: Date | null | undefined, agora: Date): boolean {
  if (!prevista) return false;
  return diasEntre(diaLocal(prevista), diaLocal(agora)) > 0;
}

/** A próxima ação está marcada para hoje (dia local)? */
export function proximaAcaoHoje(prevista: Date | null | undefined, agora: Date): boolean {
  if (!prevista) return false;
  return diaLocal(prevista) === diaLocal(agora);
}

/** A próxima ação está marcada para depois de hoje? */
export function proximaAcaoFutura(prevista: Date | null | undefined, agora: Date): boolean {
  if (!prevista) return false;
  return diasEntre(diaLocal(agora), diaLocal(prevista)) > 0;
}

export type Frescor = {
  diasSemInteracao: number | null;
  followUpAtrasado: boolean;
  proximaAcaoHoje: boolean;
  proximaAcaoFutura: boolean;
};

/**
 * Tudo de uma vez, para o card do board não recalcular quatro vezes a mesma conversão de fuso.
 * `Intl.DateTimeFormat.format` não é barato quando roda por linha numa lista de 200.
 */
export function frescorDe(
  entrada: { ultimaInteracao?: Date | null; proximaAcaoEm?: Date | null },
  agora: Date,
): Frescor {
  return {
    diasSemInteracao: diasSemInteracao(entrada.ultimaInteracao, agora),
    followUpAtrasado: followUpAtrasado(entrada.proximaAcaoEm, agora),
    proximaAcaoHoje: proximaAcaoHoje(entrada.proximaAcaoEm, agora),
    proximaAcaoFutura: proximaAcaoFutura(entrada.proximaAcaoEm, agora),
  };
}
