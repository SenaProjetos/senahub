import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";
import { minutosPorDiaSessao } from "@/modules/ponto/engine";
import { diferencaEmDias } from "@/lib/data";
import { agregarHoras, type HorasPessoa } from "@/modules/rh/produtividade/horas";
import { somarDias } from "@/modules/rh/produtividade/periodo";
import { wherePessoasDasHoras } from "@/modules/rh/produtividade/pessoas-horas";
import type { Contratacao } from "@/generated/prisma/enums";

/**
 * Item 7 — Produtividade por projetista (semanal/mensal).
 *
 * MÉTRICA (somente dados realmente coletados hoje — nada inventado):
 *  - horas:    soma da duração de `SessaoTrabalho` (ponto), incluindo a sessão
 *              ainda aberta até o instante da consulta.
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
  contratacao: Contratacao | null;
  mediaOutput: number;
  totalHoras: number;
  totalEntregas: number;
  totalTarefas: number;
  totalAtrasos: number;
  periodos: PeriodoProdutividade[];
};

export type PessoaHoras = HorasPessoa & { nome: string; contratacao: Contratacao | null };
export type HorasProjetistas = { dias: string[]; destinos: Record<string, string>; pessoas: PessoaHoras[] };

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
    where: whereAudiencia("projeto_membro"),
    select: { id: true, name: true, contratacao: true },
    orderBy: { name: "asc" },
  });
  if (projetistas.length === 0) return { periodos, granularidade, projetistas: [] };
  const ids = projetistas.map((p) => p.id);

  const agora = new Date();
  const [sessoes, pagamentos, tarefas, disciplinas, eapAtrasadas] = await Promise.all([
    prisma.sessaoTrabalho.findMany({
      where: {
        userId: { in: ids },
        inicio: { lt: agora },
        OR: [{ fim: { gte: inicio } }, { fim: null }],
      },
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
    for (const [dia, minutos] of minutosPorDiaSessao(s.inicio, s.fim, agora)) {
      const chave = chaveDe(new Date(`${dia}T12:00:00Z`));
      if (periodosValidos.has(chave)) incr(horas, s.userId, chave, minutos / 60);
    }
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
    if (!d.entregueEm) continue;
    // Por DIA: entregar no próprio dia do prazo é no prazo (ver `lib/data.ts`).
    const atraso = diferencaEmDias(d.prazo, d.entregueEm);
    if (atraso == null || atraso <= 0) continue; // só atrasadas
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
      contratacao: p.contratacao,
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

/**
 * Horas do período por pessoa, dia e destino (projeto / reuniões / sem projeto) — a fonte única das
 * telas de horas. Sem `userIds`, lê a audiência `projeto_membro` (RH → Produtividade); com `userIds`,
 * exatamente essas pessoas, de qualquer perfil (Minhas horas, card do Início).
 */
export async function horasProjetistas(
  periodo: { de: string; ate: string },
  opcoes: { userIds?: string[]; agora?: Date } = {},
): Promise<HorasProjetistas> {
  const agora = opcoes.agora ?? new Date();
  const inicio = new Date(`${periodo.de}T00:00:00-03:00`);
  const fimExclusivo = new Date(`${somarDias(periodo.ate, 1)}T00:00:00-03:00`);
  const usuarios = await prisma.user.findMany({
    // Sem `userIds`: ativos da audiência + desligados com sessão no período (ver `wherePessoasDasHoras`).
    where: opcoes.userIds ? { id: { in: opcoes.userIds } } : wherePessoasDasHoras(inicio, fimExclusivo),
    select: { id: true, name: true, contratacao: true },
    orderBy: { name: "asc" },
  });
  const ids = usuarios.map((u) => u.id);

  const sessoes =
    ids.length === 0
      ? []
      : await prisma.sessaoTrabalho.findMany({
          where: {
            userId: { in: ids },
            inicio: { lt: fimExclusivo < agora ? fimExclusivo : agora },
            OR: [{ fim: { gte: inicio } }, { fim: null }],
          },
          select: {
            userId: true,
            inicio: true,
            fim: true,
            tipoAlocacao: true,
            projeto: { select: { id: true, codigo: true, nome: true } },
          },
        });

  const agregado = agregarHoras(sessoes, { de: periodo.de, ate: periodo.ate, agora, userIds: ids });
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  return {
    dias: agregado.dias,
    destinos: agregado.destinos,
    pessoas: agregado.pessoas.map((p) => ({ ...p, nome: porId.get(p.userId)!.name, contratacao: porId.get(p.userId)!.contratacao })),
  };
}
