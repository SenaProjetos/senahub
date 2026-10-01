/**
 * Aritmética de data-calendário sobre strings `YYYY-MM-DD` (pura). Calcula em UTC para não
 * depender do fuso de quem roda: o mesmo dia no servidor e no navegador.
 */
import type { DataIso } from "@/modules/financeiro/liquidez/tipos";

const MS_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function paraUtc(d: DataIso): number {
  const m = FORMATO.exec(d);
  if (!m) throw new Error(`Data inválida para o planejador: "${d}" (esperado YYYY-MM-DD).`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function dataValida(d: string): boolean {
  const m = FORMATO.exec(d);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === d;
}

export function somarDias(d: DataIso, n: number): DataIso {
  return new Date(paraUtc(d) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Dias inteiros de `de` até `ate` (positivo = `ate` à frente). */
export function diasEntre(de: DataIso, ate: DataIso): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / MS_DIA);
}

/** `dd/mm`, para avisos. */
export function diaMes(d: DataIso): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** Data `YYYY-MM-DD` de um `Date` gravado como meia-noite UTC (coluna `@db.Date`). */
export function isoDeDataDoBanco(d: Date): DataIso {
  return d.toISOString().slice(0, 10);
}
