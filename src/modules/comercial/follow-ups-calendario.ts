/**
 * Datas do calendário de Follow-ups. Puro, sem I/O — mesma convenção da Agenda geral: semana de
 * segunda a domingo, dia-calendário LOCAL (uma ação das 23h de terça é de terça, não de quarta).
 */

export type VistaCalendario = "semana" | "mes";

export function chaveDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDias(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Segunda-feira da semana que contém `d`. */
export function inicioDaSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0 = domingo
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  return r;
}

export function diasDaSemana(ref: Date): Date[] {
  const seg = inicioDaSemana(ref);
  return Array.from({ length: 7 }, (_, i) => addDias(seg, i));
}

/** Grade do mês: semanas completas (seg→dom) cobrindo o mês de `ref`, 4 a 6 linhas. */
export function diasDoMes(ref: Date): Date[] {
  const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const inicio = inicioDaSemana(primeiro);
  const fim = addDias(inicioDaSemana(ultimo), 6);
  const total = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
  return Array.from({ length: total }, (_, i) => addDias(inicio, i));
}

/** Desloca a data de referência uma "página" para trás/frente, conforme a vista. */
export function navegar(ref: Date, vista: VistaCalendario, delta: 1 | -1): Date {
  if (vista === "semana") return addDias(ref, 7 * delta);
  return new Date(ref.getFullYear(), ref.getMonth() + delta, 1);
}

export function agruparPorDia<T extends { inicio: string }>(itens: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of itens) {
    const k = chaveDia(new Date(item.inicio));
    const lista = m.get(k);
    if (lista) lista.push(item);
    else m.set(k, [item]);
  }
  return m;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "16–22 de setembro de 2026" / "28 de set. – 4 de out. de 2026" / "setembro de 2026". */
export function tituloDoPeriodo(ref: Date, vista: VistaCalendario): string {
  if (vista === "mes") return `${MESES[ref.getMonth()]} de ${ref.getFullYear()}`;
  const dias = diasDaSemana(ref);
  const a = dias[0];
  const b = dias[6];
  const mes = (d: Date) => MESES[d.getMonth()].toLowerCase();
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} de ${mes(b)} de ${b.getFullYear()}`;
  return `${a.getDate()} de ${mes(a).slice(0, 3)}. – ${b.getDate()} de ${mes(b).slice(0, 3)}. de ${b.getFullYear()}`;
}

/** "2026-09-21" → meia-noite local desse dia (inverso de `chaveDia`). */
export function diaDaChave(chave: string): Date {
  const [a, m, d] = chave.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/**
 * Reagendar arrastando: leva a ação para `dia` mantendo o HORÁRIO em que estava. Arrastar é uma
 * decisão sobre o dia; a hora combinada com o cliente não muda por causa disso.
 */
export function moverParaDia(inicioIso: string, dia: Date): string {
  const original = new Date(inicioIso);
  return new Date(
    dia.getFullYear(),
    dia.getMonth(),
    dia.getDate(),
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
  ).toISOString();
}
