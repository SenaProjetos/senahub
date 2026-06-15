import "server-only";
import { prisma } from "@/lib/prisma";

/** Pedidos de cadastro pendentes (para o admin) (E7). */
export async function solicitacoesCadastroPendentes() {
  const ss = await prisma.solicitacaoCadastro.findMany({ where: { status: "pendente" }, orderBy: { createdAt: "asc" } });
  return ss.map((s) => ({
    id: s.id,
    nome: s.nome,
    email: s.email,
    telefone: s.telefone,
    mensagem: s.mensagem,
    createdAt: s.createdAt.toISOString(),
  }));
}
