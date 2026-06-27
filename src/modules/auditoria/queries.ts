import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { montarHeatmap, type HeatmapUso } from "./heatmap";
import { metricasPorSecao, serieDiaria, distribuicaoDiaHora, type MetricaSecao } from "./uso";

function janela(dias: number, hoje: Date) {
  const inicioAtual = new Date(hoje);
  inicioAtual.setHours(0, 0, 0, 0);
  inicioAtual.setDate(inicioAtual.getDate() - (dias - 1));
  const inicioAnterior = new Date(inicioAtual);
  inicioAnterior.setDate(inicioAnterior.getDate() - dias);
  return { inicioAtual, inicioAnterior };
}

export type AnaliseUso = {
  dias: number;
  totalAcessos: number;
  totalAcoes: number;
  metricas: MetricaSecao[];
  heatmapSecaoDia: HeatmapUso;
  diaHora: { matriz: number[][]; max: number };
  nomes: Record<string, string>;
};

/**
 * Análise de uso por seção (admin): combina Acessos (page-views, AcessoPagina)
 * e Ações (AuditLog) na janela de `dias`, com a janela anterior para o Δ.
 */
export async function analiseUso(dias = 14): Promise<AnaliseUso> {
  const hoje = new Date();
  const { inicioAtual, inicioAnterior } = janela(dias, hoje);

  const [acessos, acessosAnt, acoes] = await Promise.all([
    prisma.acessoPagina.findMany({ where: { createdAt: { gte: inicioAtual } }, select: { secao: true, userId: true, createdAt: true }, take: 100000 }),
    prisma.acessoPagina.findMany({ where: { createdAt: { gte: inicioAnterior, lt: inicioAtual } }, select: { secao: true, userId: true, createdAt: true }, take: 100000 }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: inicioAtual } }, select: { modulo: true, acao: true, userId: true, resultado: true, createdAt: true }, take: 100000 }),
  ]);

  const evAcessos = acessos.map((a) => ({ secao: a.secao, userId: a.userId, em: a.createdAt }));
  const evAcessosAnt = acessosAnt.map((a) => ({ secao: a.secao, userId: a.userId, em: a.createdAt }));
  const evAcoes = acoes.map((a) => ({ modulo: a.modulo, acao: a.acao, userId: a.userId, em: a.createdAt, resultado: a.resultado }));

  const metricas = metricasPorSecao(evAcessos, evAcessosAnt, evAcoes);
  const heatmapSecaoDia = montarHeatmap(evAcessos.map((e) => ({ modulo: e.secao, em: e.em })), { dias, hoje });
  const diaHora = distribuicaoDiaHora(evAcessos);

  const ids = [...new Set(metricas.map((m) => m.topUsuario?.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nomes = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return { dias, totalAcessos: evAcessos.length, totalAcoes: evAcoes.length, metricas, heatmapSecaoDia, diaHora, nomes };
}

export type DetalheSecao = {
  secao: string;
  dias: number;
  totalAcessos: number;
  totalAcoes: number;
  falhas: number;
  bloqueios: number;
  topAcoes: { acao: string; total: number }[];
  topUsuarios: { nome: string; total: number }[];
  serie: { rotulo: string; valor: number }[];
};

/** Drill-down de uma seção: top ações, top usuários, série diária e problemas. */
export async function detalheSecao(secao: string, dias = 14): Promise<DetalheSecao> {
  const hoje = new Date();
  const { inicioAtual } = janela(dias, hoje);

  const [acessos, acoes] = await Promise.all([
    prisma.acessoPagina.findMany({ where: { secao, createdAt: { gte: inicioAtual } }, select: { userId: true, createdAt: true }, take: 100000 }),
    prisma.auditLog.findMany({ where: { modulo: secao, createdAt: { gte: inicioAtual } }, select: { acao: true, userId: true, resultado: true, createdAt: true }, take: 100000 }),
  ]);

  const porAcao = new Map<string, number>();
  const porUser = new Map<string, number>();
  let falhas = 0;
  let bloqueios = 0;
  for (const a of acoes) {
    porAcao.set(a.acao, (porAcao.get(a.acao) ?? 0) + 1);
    if (a.userId) porUser.set(a.userId, (porUser.get(a.userId) ?? 0) + 1);
    if (a.resultado === "falha" || a.resultado === "rejeitado") falhas += 1;
    if (a.resultado === "bloqueado") bloqueios += 1;
  }
  for (const a of acessos) porUser.set(a.userId, (porUser.get(a.userId) ?? 0) + 1);

  const topAcoes = [...porAcao.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([acao, total]) => ({ acao, total }));
  const topUserIds = [...porUser.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  const users = topUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: topUserIds.map(([id]) => id) } }, select: { id: true, name: true } })
    : [];
  const nome = new Map(users.map((u) => [u.id, u.name]));
  const topUsuarios = topUserIds.map(([id, total]) => ({ nome: nome.get(id) ?? "—", total }));
  const serie = serieDiaria(acessos.map((a) => ({ em: a.createdAt })), { dias, hoje });

  return { secao, dias, totalAcessos: acessos.length, totalAcoes: acoes.length, falhas, bloqueios, topAcoes, topUsuarios, serie };
}

export type AuditFiltro = {
  modulo?: string;
  resultado?: string;
  q?: string;
  de?: string;
  ate?: string;
  page?: number;
};

const PAGE_SIZE = 50;

function buildWhere(filtro: AuditFiltro): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filtro.modulo) where.modulo = filtro.modulo;
  if (filtro.resultado) where.resultado = filtro.resultado;
  if (filtro.q) {
    where.OR = [
      { acao: { contains: filtro.q, mode: "insensitive" } },
      { entidade: { contains: filtro.q, mode: "insensitive" } },
      { user: { name: { contains: filtro.q, mode: "insensitive" } } },
    ];
  }

  const de = filtro.de ? new Date(`${filtro.de}T00:00:00`) : null;
  const ate = filtro.ate ? new Date(`${filtro.ate}T23:59:59.999`) : null;
  if ((de && !isNaN(de.getTime())) || (ate && !isNaN(ate.getTime()))) {
    where.createdAt = {};
    if (de && !isNaN(de.getTime())) where.createdAt.gte = de;
    if (ate && !isNaN(ate.getTime())) where.createdAt.lte = ate;
  }

  return where;
}

export async function listarAuditoria(filtro: AuditFiltro) {
  const where = buildWhere(filtro);

  const page = Math.max(1, filtro.page ?? 1);

  const [rows, total, modulos] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["modulo"],
      select: { modulo: true },
      orderBy: { modulo: "asc" },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pages: Math.ceil(total / PAGE_SIZE),
    modulos: modulos.map((m) => m.modulo),
  };
}

const EXPORT_LIMIT = 10000;

export async function auditoriaParaExport(
  filtro: Omit<AuditFiltro, "page">,
) {
  const where = buildWhere(filtro);
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { user: { select: { name: true, email: true } } },
  });
}
