import "server-only";
import { prisma } from "@/lib/prisma";

/** Feedbacks/1:1 recentes (todos os colaboradores), com nomes resolvidos. */
export async function listarFeedbacks(limit = 40) {
  const fs = await prisma.feedbackRH.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });
  const autorIds = [...new Set(fs.map((f) => f.autorId))];
  const autores = await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } });
  const nome = new Map(autores.map((u) => [u.id, u.name]));
  return fs.map((f) => ({
    id: f.id,
    alvo: f.user.name,
    autor: nome.get(f.autorId) ?? "—",
    tipo: f.tipo,
    conteudo: f.conteudo,
    createdAt: f.createdAt.toISOString(),
  }));
}

/** Colaboradores internos (para selects de feedback e ponto manual). */
export async function colaboradoresInternos() {
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
