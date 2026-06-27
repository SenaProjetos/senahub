import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { montarHeatmap } from "./heatmap";

/**
 * Heatmap de uso por seção (módulo): conta eventos de auditoria por módulo × dia
 * na janela de `dias` (inclui hoje). Admin-only (chamado de página protegida).
 */
export async function heatmapUso(dias = 14) {
  const hoje = new Date();
  const desde = new Date(hoje);
  desde.setDate(hoje.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);
  const eventos = await prisma.auditLog.findMany({
    where: { createdAt: { gte: desde } },
    select: { modulo: true, createdAt: true },
    take: 50000,
  });
  return montarHeatmap(
    eventos.map((e) => ({ modulo: e.modulo, em: e.createdAt })),
    { dias, hoje },
  );
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
