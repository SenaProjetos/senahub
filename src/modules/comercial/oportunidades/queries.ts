import "server-only";
import { prisma } from "@/lib/prisma";

export const ETAPAS_OPORTUNIDADE = ["qualificacao", "proposta", "negociacao", "fechamento"] as const;

/** Oportunidades comerciais com atividades e nomes resolvidos. */
export async function listarOportunidades() {
  const ops = await prisma.oportunidade.findMany({
    orderBy: { updatedAt: "desc" },
    include: { atividades: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

  const cliIds = [...new Set(ops.map((o) => o.clienteId).filter(Boolean) as string[])];
  const userIds = [
    ...new Set([
      ...ops.map((o) => o.responsavelId).filter(Boolean) as string[],
      ...ops.flatMap((o) => o.atividades.map((a) => a.autorId)),
    ]),
  ];
  const [clis, users] = await Promise.all([
    prisma.cliente.findMany({ where: { id: { in: cliIds } }, select: { id: true, nome: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const cmap = new Map(clis.map((c) => [c.id, c.nome]));
  const umap = new Map(users.map((u) => [u.id, u.name]));

  return ops.map((o) => ({
    id: o.id,
    titulo: o.titulo,
    cliente: o.clienteId ? (cmap.get(o.clienteId) ?? null) : null,
    valorEstimado: o.valorEstimado != null ? Number(o.valorEstimado) : null,
    etapa: o.etapa,
    status: o.status,
    responsavel: o.responsavelId ? (umap.get(o.responsavelId) ?? null) : null,
    observacao: o.observacao,
    atividades: o.atividades.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      descricao: a.descricao,
      autor: umap.get(a.autorId) ?? "—",
      createdAt: a.createdAt.toISOString(),
    })),
  }));
}

export async function opcoesOportunidade() {
  const [clientes, internos] = await Promise.all([
    prisma.cliente.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.user.findMany({ where: { ativo: true, role: { not: "cliente" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { clientes, internos };
}
