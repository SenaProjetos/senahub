import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarFeriados(ano?: number) {
  const where = ano
    ? { data: { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) } }
    : {};
  const fs = await prisma.feriado.findMany({ where, orderBy: { data: "asc" } });
  return fs.map((f) => ({ id: f.id, data: f.data.toISOString().slice(0, 10), nome: f.nome, tipo: f.tipo }));
}

/** Nº de feriados que caem em dia útil (seg–sex) no mês — desconta do esperado do ponto. */
export async function feriadosUteisNoMes(ano: number, mes: number): Promise<number> {
  const fs = await prisma.feriado.findMany({
    where: { data: { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) } },
    select: { data: true },
  });
  return fs.filter((f) => {
    const wd = f.data.getUTCDay();
    return wd !== 0 && wd !== 6;
  }).length;
}

/** Domingo de Páscoa (algoritmo de Meeus/Butcher) — base dos feriados móveis. */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaP = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, diaP));
}

/** Feriados nacionais (fixos + móveis baseados na Páscoa) de um ano. */
export function feriadosNacionais(ano: number): { data: Date; nome: string }[] {
  const p = pascoa(ano);
  const desloca = (dias: number) => new Date(p.getTime() + dias * 86400000);
  return [
    { data: new Date(Date.UTC(ano, 0, 1)), nome: "Confraternização Universal" },
    { data: desloca(-48), nome: "Carnaval (segunda)" },
    { data: desloca(-47), nome: "Carnaval (terça)" },
    { data: desloca(-2), nome: "Sexta-feira Santa" },
    { data: new Date(Date.UTC(ano, 3, 21)), nome: "Tiradentes" },
    { data: new Date(Date.UTC(ano, 4, 1)), nome: "Dia do Trabalho" },
    { data: desloca(60), nome: "Corpus Christi" },
    { data: new Date(Date.UTC(ano, 8, 7)), nome: "Independência do Brasil" },
    { data: new Date(Date.UTC(ano, 9, 12)), nome: "Nossa Senhora Aparecida" },
    { data: new Date(Date.UTC(ano, 10, 2)), nome: "Finados" },
    { data: new Date(Date.UTC(ano, 10, 15)), nome: "Proclamação da República" },
    { data: new Date(Date.UTC(ano, 11, 25)), nome: "Natal" },
  ];
}
