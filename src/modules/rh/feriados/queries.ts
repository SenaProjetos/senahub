import "server-only";
import { prisma } from "@/lib/prisma";

const pad = (n: number) => String(n).padStart(2, "0");

export type FeriadoDia = {
  id: string;
  data: string; // YYYY-MM-DD
  nome: string;
  tipo: string; // nacional | estadual | municipal (esfera)
  origem: "unico" | "recorrente";
};

export type FeriadoRecorrenteItem = {
  id: string;
  dia: number;
  mes: number;
  nome: string;
  tipo: string;
};

/** Feriados recorrentes cadastrados (data fixa, repetem todo ano). */
export async function listarFeriadosRecorrentes(): Promise<FeriadoRecorrenteItem[]> {
  const rs = await prisma.feriadoRecorrente.findMany({ orderBy: [{ mes: "asc" }, { dia: "asc" }] });
  return rs.map((r) => ({ id: r.id, dia: r.dia, mes: r.mes, nome: r.nome, tipo: r.tipo }));
}

/**
 * Feriados concretos de um ano: une os avulsos (`Feriado`, ocorrência única) com os
 * recorrentes expandidos para aquele ano. Dedup por data — o avulso vence o recorrente.
 * Contrato `{ data, nome, tipo }` mantido (ponto/escala consomem sem alteração).
 * Sem `ano` retorna só os avulsos (comportamento antigo).
 */
export async function listarFeriados(ano?: number): Promise<FeriadoDia[]> {
  const where = ano
    ? { data: { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) } }
    : {};
  const avulsos = await prisma.feriado.findMany({ where, orderBy: { data: "asc" } });

  const porData = new Map<string, FeriadoDia>();
  for (const f of avulsos) {
    const data = f.data.toISOString().slice(0, 10);
    porData.set(data, { id: f.id, data, nome: f.nome, tipo: f.tipo, origem: "unico" });
  }

  if (ano) {
    const recorrentes = await prisma.feriadoRecorrente.findMany();
    for (const r of recorrentes) {
      const data = `${ano}-${pad(r.mes)}-${pad(r.dia)}`;
      // Avulso na mesma data tem prioridade (permite sobrescrever/ajustar um ano específico).
      if (!porData.has(data)) {
        porData.set(data, { id: r.id, data, nome: r.nome, tipo: r.tipo, origem: "recorrente" });
      }
    }
  }

  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * É feriado (avulso ou recorrente) no dia local `diaISO` (formato YYYY-MM-DD)?
 * Usado pelos avisos de ponto para não disparar em dia não útil.
 */
export async function ehFeriado(diaISO: string): Promise<boolean> {
  const ano = Number(diaISO.slice(0, 4));
  if (!Number.isFinite(ano)) return false;
  const feriados = await listarFeriados(ano);
  return feriados.some((f) => f.data === diaISO);
}

/** Nº de feriados que caem em dia útil (seg–sex) no mês — desconta do esperado do ponto. */
export async function feriadosUteisNoMes(ano: number, mes: number): Promise<number> {
  const prefixo = `${ano}-${pad(mes)}`;
  const doMes = (await listarFeriados(ano)).filter((f) => f.data.startsWith(prefixo));
  return doMes.filter((f) => {
    const wd = new Date(f.data + "T00:00:00Z").getUTCDay();
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
