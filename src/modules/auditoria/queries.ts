import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type AuditFiltro = {
  modulo?: string;
  resultado?: string;
  q?: string;
  page?: number;
};

const PAGE_SIZE = 50;

export async function listarAuditoria(filtro: AuditFiltro) {
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
