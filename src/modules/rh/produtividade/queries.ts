import "server-only";
import { prisma } from "@/lib/prisma";
import { PROJETO_MEMBRO_ROLES } from "@/lib/roles";

/**
 * Item 7 — Produtividade por projetista (semanal/mensal).
 *
 * MÉTRICA (somente dados realmente coletados hoje — nada inventado):
 *  - horas:    soma da duração de `SessaoTrabalho` (ponto) com fim preenchido.
 *  - entregas: nº de `PagamentoProjetista` liberados (`liberadoEm`) — entregas validadas.
 *  - tarefas:  nº de `Tarefa` concluídas (`concluidaEm`) por responsável.
 *  - atrasos:  disciplinas entregues COM atraso (`entregueEm > prazo`) + tarefas da EAP
 *              (cronograma) vencidas e não concluídas (`fimPrevisto < hoje` e `progresso < 100`).
 *
 *  output (produção do período) = entregas + tarefas → throughput positivo.
 *
 * INDICADOR DE QUEDA: um período é marcado quando seu `output` fica abaixo de
 * LIMIAR_QUEDA × média de output DO PRÓPRIO projetista na janela. A comparação é
 * sempre contra a própria média (nunca entre projetistas distintos).
 */
export const LIMIAR_QUEDA = 0.7;

export type Granularidade = "semana" | "mes";

export type PeriodoProdutividade = {
  periodo: string; // YYYY-Www (semana) ou YYYY-MM (mês)
  horas: number;
  entregas: number;
  tarefas: number;
  atrasos: number;
  output: number;
  queda: boolean;
};

export type ProjetistaProdutividade = {
  userId: string;
  nome: string;
  role: string;
  mediaOutput: number;
  totalHoras: number;
  totalEntregas: number;
  totalTarefas: number;
  totalAtrasos: number;
  periodos: PeriodoProdutividade[];
};

/** Chave ISO-8601 da semana (YYYY-Www) de uma data. */
function isoWeek(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jan4 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const weekNum = Math.ceil(((tmp.getTime() - startOfWeek1.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Buckets do período (antigo → recente), data de início da janela e função de chave. */
function definirJanela(g: Granularidade): { periodos: string[]; inicio: Date; chaveDe: (d: Date) => string } {
  const hoje = new Date();
  if (g === "mes") {
    const periodos: string[] = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
      periodos.push(chaveMes(d));
    }
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 5, 1));
    return { periodos, inicio, chaveDe: chaveMes };
  }
  // semana — últimas 12
  const periodos: string[] = [];
  for (let k = 11; k >= 0; k--) periodos.push(isoWeek(new Date(hoje.getTime() - k * 7 * 86_400_000)));
  const inicio = new Date(hoje.getTime() - 11 * 7 * 86_400_000);
  inicio.setUTCHours(0, 0, 0, 0);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  return { periodos, inicio, chaveDe: isoWeek };
}

function incr(mapa: Map<string, Map<string, number>>, userId: string, chave: string, valor: number) {
  if (!mapa.has(userId)) mapa.set(userId, new Map());
  const m = mapa.get(userId)!;
  m.set(chave, (m.get(chave) ?? 0) + valor);
}

export async function produtividadeProjetistas(
  granularidade: Granularidade = "semana",
): Promise<{ periodos: string[]; granularidade: Granularidade; projetistas: ProjetistaProdutividade[] }> {
  const { periodos, inicio, chaveDe } = definirJanela(granularidade);
  const periodosValidos = new Set(periodos);

  const projetistas = await prisma.user.findMany({
    where: { ativo: true, role: { in: PROJETO_MEMBRO_ROLES } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  if (projetistas.length === 0) return { periodos, granularidade, projetistas: [] };
  const ids = projetistas.map((p) => p.id);

  const agora = new Date();
  const [sessoes, pagamentos, tarefas, disciplinas, eapAtrasadas] = await Promise.all([
    prisma.sessaoTrabalho.findMany({
      where: { userId: { in: ids }, inicio: { gte: inicio }, fim: { not: null } },
      select: { userId: true, inicio: true, fim: true },
    }),
    prisma.pagamentoProjetista.findMany({
      where: { projetistaId: { in: ids }, liberadoEm: { gte: inicio } },
      select: { projetistaId: true, liberadoEm: true },
    }),
    prisma.tarefa.findMany({
      where: { arquivada: false, concluidaEm: { gte: inicio }, responsaveis: { some: { userId: { in: ids } } } },
      select: { concluidaEm: true, responsaveis: { select: { userId: true } } },
    }),
    prisma.disciplina.findMany({
      where: { entregueEm: { gte: inicio, not: null }, prazo: { not: null }, responsaveis: { some: { userId: { in: ids } } } },
      select: { entregueEm: true, prazo: true, responsaveis: { select: { userId: true } } },
    }),
    // Tarefas da EAP vencidas e não concluídas (atraso de cronograma), por responsável da disciplina.
    prisma.eapTarefa.findMany({
      where: {
        progresso: { lt: 100 },
        fimPrevisto: { gte: inicio, lt: agora },
        disciplina: { is: { responsaveis: { some: { userId: { in: ids } } } } },
      },
      select: { fimPrevisto: true, disciplina: { select: { responsaveis: { select: { userId: true } } } } },
    }),
  ]);

  const horas = new Map<string, Map<string, number>>();
  const entregas = new Map<string, Map<string, number>>();
  const tarefasMap = new Map<string, Map<string, number>>();
  const atrasos = new Map<string, Map<string, number>>();

  for (const s of sessoes) {
    const mins = (s.fim!.getTime() - s.inicio.getTime()) / 60_000;
    if (mins <= 0) continue;
    incr(horas, s.userId, chaveDe(s.inicio), mins / 60);
  }
  for (const p of pagamentos) {
    if (!p.liberadoEm) continue;
    incr(entregas, p.projetistaId, chaveDe(p.liberadoEm), 1);
  }
  for (const t of tarefas) {
    if (!t.concluidaEm) continue;
    const chave = chaveDe(t.concluidaEm);
    for (const r of t.responsaveis) if (ids.includes(r.userId)) incr(tarefasMap, r.userId, chave, 1);
  }
  for (const d of disciplinas) {
    if (!d.entregueEm || !d.prazo || d.entregueEm <= d.prazo) continue; // só atrasadas
    const chave = chaveDe(d.entregueEm);
    if (!periodosValidos.has(chave)) continue;
    for (const r of d.responsaveis) if (ids.includes(r.userId)) incr(atrasos, r.userId, chave, 1);
  }
  for (const e of eapAtrasadas) {
    const chave = chaveDe(e.fimPrevisto);
    if (!periodosValidos.has(chave)) continue;
    for (const r of e.disciplina?.responsaveis ?? []) if (ids.includes(r.userId)) incr(atrasos, r.userId, chave, 1);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const linhas = projetistas.map((p) => {
    const dados = periodos.map((chave) => {
      const h = round1(horas.get(p.id)?.get(chave) ?? 0);
      const e = entregas.get(p.id)?.get(chave) ?? 0;
      const t = tarefasMap.get(p.id)?.get(chave) ?? 0;
      const a = atrasos.get(p.id)?.get(chave) ?? 0;
      return { periodo: chave, horas: h, entregas: e, tarefas: t, atrasos: a, output: e + t, queda: false };
    });

    const mediaOutput = dados.reduce((s, w) => s + w.output, 0) / dados.length;
    for (const w of dados) w.queda = mediaOutput > 0 && w.output < LIMIAR_QUEDA * mediaOutput;

    return {
      userId: p.id,
      nome: p.name,
      role: p.role,
      mediaOutput: round1(mediaOutput),
      totalHoras: round1(dados.reduce((s, w) => s + w.horas, 0)),
      totalEntregas: dados.reduce((s, w) => s + w.entregas, 0),
      totalTarefas: dados.reduce((s, w) => s + w.tarefas, 0),
      totalAtrasos: dados.reduce((s, w) => s + w.atrasos, 0),
      periodos: dados,
    };
  });

  const projetistasAtivos = linhas.filter(
    (l) => l.totalHoras > 0 || l.totalEntregas > 0 || l.totalTarefas > 0 || l.totalAtrasos > 0,
  );

  return { periodos, granularidade, projetistas: projetistasAtivos };
}
