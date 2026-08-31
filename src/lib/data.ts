/**
 * Regra única de leitura de data-calendário (pura, sem I/O).
 *
 * Prazos são DATA, não horário: o banco guarda meia-noite UTC (campos `@db.Date`
 * e também os `DateTime` gravados a partir de um `<input type="date">`). Ler
 * `getDate()` direto num fuso atrás de UTC (America/Sao_Paulo) devolve o dia
 * ANTERIOR — foi o que fez o prazo do projeto aparecer 01/09 no painel e 02/09
 * no card de /projetos. Passe SEMPRE por aqui antes de formatar ou comparar dia.
 */

/** Converte Date | string (ISO ou yyyy-mm-dd) em Date local; null se inválido. */
export function paraData(d: Date | string | null | undefined): Date | null {
  if (d == null) return null
  let date: Date
  if (d instanceof Date) {
    date = d
  } else {
    // yyyy-mm-dd puro: já é uma data local (sem fuso).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    date = new Date(d)
  }
  if (isNaN(date.getTime())) return null
  // Campos de data do Prisma chegam como meia-noite UTC — seja como objeto Date
  // ou já serializados em string ISO ("2026-07-15T00:00:00.000Z"). Reconstrói em
  // horário local com o mesmo ano/mês/dia para não exibir um dia a menos em fusos
  // atrás de UTC (ex.: America/Sao_Paulo).
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }
  return date
}

/** Meia-noite local do dia da data (já normalizada por `paraData`); null se inválida. */
export function inicioDoDia(d: Date | string | null | undefined): Date | null {
  const date = paraData(d)
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null
}

/**
 * Meia-noite local de um INSTANTE local (padrão: agora). Sem heurística — use
 * para "hoje", nunca para um valor vindo do banco (aí é `inicioDoDia`).
 *
 * O caminho separado não é preciosismo: às 21:00:00.000 em America/Sao_Paulo o
 * `new Date()` tem todos os componentes UTC zerados e a heurística de
 * `paraData` o confundiria com uma data do banco, devolvendo o dia seguinte.
 */
export function inicioDoDiaLocal(agora: Date = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

/**
 * Meia-noite **UTC** do dia-calendário local de um instante local (padrão: agora)
 * — use SÓ como fronteira de `where` do Prisma sobre colunas de data (`@db.Date`
 * ou `DateTime` gravado a partir de um `<input type="date">`, que o Prisma grava
 * como meia-noite UTC).
 *
 * Comparar essas colunas com meia-noite LOCAL (03:00Z em America/Sao_Paulo) faz
 * o registro de HOJE cair fora do intervalo: `data: { gte: hoje }` perdia o
 * evento do dia e `validade: { lt: hoje }` vencia a proposta um dia antes.
 *
 * Não é `toISOString().slice(0,10)`: às 21h de 02/09 em BRT isso daria 03/09.
 */
export function inicioDoDiaUtc(agora: Date = new Date()): Date {
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()))
}

/**
 * Diferença em DIAS inteiros entre duas datas-calendário (`ate - de`), normalizando
 * as duas pontas. Positivo = `ate` está à frente. `null` se qualquer ponta faltar.
 */
export function diferencaEmDias(
  de: Date | string | null | undefined,
  ate: Date | string | null | undefined,
): number | null {
  const a = inicioDoDia(de)
  const b = inicioDoDia(ate)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * O prazo já venceu? **Só depois de o dia passar** — no próprio dia do prazo ainda
 * dá tempo, então retorna `false`.
 *
 * Existe porque `prazo < new Date()` (ou `< new Date(new Date().toDateString())`)
 * marcava vencido logo na virada do dia: o prazo vem do banco em meia-noite UTC e
 * qualquer hora do dia local já é maior que ele.
 */
export function prazoVencido(
  prazo: Date | string | null | undefined,
  agora: Date = new Date(),
): boolean {
  const venc = inicioDoDia(prazo)
  return venc != null && venc < inicioDoDiaLocal(agora)
}

/** Dias inteiros de atraso de um prazo (0 quando ainda no prazo ou sem prazo). */
export function diasVencidos(
  prazo: Date | string | null | undefined,
  agora: Date = new Date(),
): number {
  const dias = diferencaEmDias(prazo, inicioDoDiaLocal(agora))
  return dias != null && dias > 0 ? dias : 0
}
