import "server-only";
import { prisma } from "@/lib/prisma";
import { CONTRATACAO_LABELS } from "@/modules/usuarios/vinculo/labels";

/** Pedidos de cadastro pendentes (para o admin) (E7). */
export async function solicitacoesCadastroPendentes() {
  const ss = await prisma.solicitacaoCadastro.findMany({ where: { status: "pendente" }, orderBy: { createdAt: "asc" } });
  return ss.map((s) => ({
    id: s.id,
    nome: s.nome,
    email: s.email,
    telefone: s.telefone,
    // Rótulo já pronto em pt-BR: a tela mostra o que a pessoa pediu, não o enum.
    vinculoPretendido:
      s.tipoPretendido === "externo"
        ? "Cliente"
        : (CONTRATACAO_LABELS[s.contratacaoPretendida ?? "clt"] ?? "Colaborador"),
    mensagem: s.mensagem,
    createdAt: s.createdAt.toISOString(),
  }));
}
