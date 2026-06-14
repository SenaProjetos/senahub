import "server-only";
import { prisma } from "@/lib/prisma";

export async function servicosDoProjeto(projetoId: string) {
  const ss = await prisma.servicoTerceirizado.findMany({
    where: { projetoId },
    orderBy: { createdAt: "asc" },
    include: { fornecedor: { select: { nome: true } } },
  });
  return ss.map((s) => ({
    id: s.id,
    descricao: s.descricao,
    valor: s.valor != null ? Number(s.valor) : null,
    status: s.status,
    fornecedorId: s.fornecedorId,
    fornecedor: s.fornecedor?.nome ?? null,
  }));
}

export async function fornecedoresAtivos() {
  return prisma.fornecedor.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}
