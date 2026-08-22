/**
 * Validade de proposta em **America/Recife** (F5.6, decisão transversal T5). Puro, relógio
 * injetado — nenhuma função aqui lê `new Date()` por conta própria.
 *
 * ── Qual é o bug que isto corrige ───────────────────────────────────────────────────────────
 * `Proposta.validade` é `@db.Date`: uma data civil ("30/09/2026"), sem hora. Perguntar "expirou?"
 * comparando `validade < new Date()` mistura duas grandezas diferentes — uma data civil e um
 * INSTANTE — e o resultado passa a depender do fuso do processo Node.
 *
 * Concretamente: às 23h do dia 30 em Recife, o instante já é dia 1º em UTC. A comparação ingênua
 * responde "expirada" enquanto o cliente, olhando o calendário dele, ainda está dentro do prazo.
 * A proposta some da mesa um dia antes do combinado — e some só à noite, o que torna o bug
 * intermitente e quase impossível de reproduzir de manhã.
 *
 * ── Por que `Intl`, e não subtrair 3 horas ──────────────────────────────────────────────────
 * `Intl.DateTimeFormat` com `timeZone` explícito consulta o banco de fusos do sistema, então
 * acerta horário de verão e mudanças de regra sem ninguém manter uma constante. Um `-3` fixo
 * seria uma bomba-relógio: o Brasil já teve horário de verão e pode voltar a ter.
 *
 * ── E o `TZ` do ambiente não importa ────────────────────────────────────────────────────────
 * Todas as conversões passam `timeZone` explicitamente, e a validade é lida em UTC (é assim que
 * `@db.Date` chega do Prisma: meia-noite UTC). O resultado é idêntico com `TZ=UTC`,
 * `TZ=America/Recife` ou qualquer outro — o que a suíte prova rodando duas vezes, com fusos
 * diferentes.
 */

/** Fuso de referência do escritório (T5). Toda data civil do CRM se resolve por aqui. */
export const TZ_REFERENCIA = "America/Recife";

/** `en-CA` porque o formato dele é exatamente `AAAA-MM-DD` — não é preferência de idioma. */
const FORMATADOR_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_REFERENCIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * A data civil (`AAAA-MM-DD`) em que um INSTANTE cai, no fuso de referência.
 *
 * É a função que separa as duas grandezas: recebe instante, devolve dia do calendário. Depois
 * dela, tudo vira comparação de string `AAAA-MM-DD`, que é ordenável lexicograficamente e não
 * tem fuso nenhum.
 */
export function dataCivilRecife(instante: Date): string {
  return FORMATADOR_ISO.format(instante);
}

/**
 * `Proposta.validade` (`@db.Date`) → `AAAA-MM-DD`.
 *
 * Lê em **UTC** de propósito: `@db.Date` chega do Prisma como meia-noite UTC, e usar
 * `getFullYear()` (local) devolveria o dia anterior em qualquer fuso a oeste de Greenwich —
 * exatamente o mesmo erro, na direção contrária. Aceita string para o caso do formulário, que
 * já manda `AAAA-MM-DD`.
 */
export function validadeParaISO(validade: Date | string | null | undefined): string | null {
  if (!validade) return null;
  if (typeof validade === "string") {
    return /^\d{4}-\d{2}-\d{2}$/.test(validade) ? validade : null;
  }
  if (Number.isNaN(validade.getTime())) return null;
  return validade.toISOString().slice(0, 10);
}

/**
 * `AAAA-MM-DD` → `Date` para GRAVAR num campo `@db.Date`: meia-noite UTC, explícita.
 *
 * `new Date("2026-09-30")` já faz isso (a spec trata data-only como UTC), mas depende de um
 * detalhe sutil que a próxima pessoa não tem obrigação de saber — e a variante com hora,
 * `new Date("2026-09-30T00:00:00")`, é interpretada como LOCAL e grava o dia errado. Ser
 * explícito aqui custa uma função e remove a pegadinha.
 */
export function isoParaDataValidade(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * A proposta está expirada AGORA? Compara datas civis, nunca instantes.
 *
 * Regra: expira **no fim** do dia da validade. Uma proposta válida até 30/09 continua válida
 * durante todo o dia 30 em Recife, inclusive às 23h59 — e passa a expirada só quando vira o
 * dia 1º ali. Proposta sem validade nunca expira (`false`), que é o comportamento atual: o
 * campo é opcional e sua ausência significa "sem prazo", não "prazo zero".
 */
export function propostaExpirada(
  validade: Date | string | null | undefined,
  agora: Date,
): boolean {
  const validadeISO = validadeParaISO(validade);
  if (!validadeISO) return false;
  return dataCivilRecife(agora) > validadeISO;
}

/**
 * Dias inteiros até a validade, em dias civis de Recife. Negativo = já passou; `0` = vence hoje;
 * `null` = sem validade.
 *
 * A conta é feita em UTC sobre as duas datas civis já normalizadas — nunca sobre os instantes
 * crus — para que a diferença não seja afetada por horário de verão de nenhum dos lados.
 * A F5.7 usa isto para decidir o que avisar.
 */
export function diasAteVencer(
  validade: Date | string | null | undefined,
  agora: Date,
): number | null {
  const validadeISO = validadeParaISO(validade);
  if (!validadeISO) return null;
  const hojeISO = dataCivilRecife(agora);
  const DIA_MS = 24 * 60 * 60 * 1000;
  const msValidade = Date.parse(`${validadeISO}T00:00:00.000Z`);
  const msHoje = Date.parse(`${hojeISO}T00:00:00.000Z`);
  return Math.round((msValidade - msHoje) / DIA_MS);
}
