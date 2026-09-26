/**
 * Aritmética de dia-calendário sobre texto `YYYY-MM-DD`, em UTC — sem virar o dia por causa do fuso.
 *
 * PURO e seguro no cliente (sem `server-only`). É a régua do Gantt, do mapa de ocupação e de tudo que
 * precisa somar dias a uma data sem passar por `Date` local: `new Date("2026-09-25")` é meia-noite UTC,
 * e `toISOString`/`getDate` locais deslocam o dia no fuso do Brasil.
 */

const MS_DIA = 86_400_000;

const paraUtc = (dia: string) => new Date(`${dia}T00:00:00Z`);
const paraTexto = (d: Date) => d.toISOString().slice(0, 10);

/** Soma `n` dias (pode ser negativo) a `dia`. */
export function somarDias(dia: string, n: number): string {
  const d = paraUtc(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return paraTexto(d);
}

/** Quantos dias de `a` até `b` (`b − a`): positivo se `b` é depois. */
export function diasEntre(a: string, b: string): number {
  return Math.round((paraUtc(b).getTime() - paraUtc(a).getTime()) / MS_DIA);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: string): number {
  return paraUtc(dia).getUTCDay();
}

/** A segunda-feira da semana de `dia` (a semana vai de segunda a domingo). */
export function segundaDaSemana(dia: string): string {
  const dow = diaDaSemana(dia);
  return somarDias(dia, dow === 0 ? -6 : 1 - dow);
}

/** O dia 1 do mês de `dia`. */
export function primeiroDiaDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/** O último dia do mês de `dia`. */
export function ultimoDiaDoMes(dia: string): string {
  const d = paraUtc(primeiroDiaDoMes(dia));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return somarDias(paraTexto(d), -1);
}

/** O dia 1 do mês que fica `n` meses depois (ou antes, se negativo) do mês de `dia`. */
export function somarMeses(dia: string, n: number): string {
  const d = paraUtc(primeiroDiaDoMes(dia));
  d.setUTCMonth(d.getUTCMonth() + n);
  return paraTexto(d);
}

/** `dd/MM/yy`, o formato compacto de coluna de data — vazio se não houver data. */
export function dataCurta(dia: string | null | undefined): string {
  return dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}` : "";
}
