"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { criarContaObraSchema, salvarContaObraSchema } from "./schemas";
import { criarContaObraNoBanco, salvarContaObraNoBanco } from "./service";

const REVALIDATE = "/configuracoes/usuarios";

/** Foto da conta de obra para a auditoria (antes da mudança). */
async function fotoDaConta(userId: string) {
  const conta = await prisma.contaObra.findUnique({
    where: { userId },
    select: { empresa: true, clienteId: true, updatedAt: true, projetos: { select: { projetoId: true } } },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, ativo: true, acessoAte: true } });
  return conta && user ? { ...user, empresa: conta.empresa, clienteId: conta.clienteId, projetoIds: conta.projetos.map((p) => p.projetoId) } : null;
}

/** Cria a conta de obra (Configurações → Usuários, "Obra"). Spec 2026-11-25. */
export const criarContaObra = defineAction(
  {
    modulo: "configuracoes",
    acao: "criar-conta-obra",
    recurso: "usuarios",
    permissao: "gerir",
    interno: true,
    entidade: "ContaObra",
    schema: criarContaObraSchema,
    // A auditoria guarda a entrada, nunca o retorno (a senha temporária só volta para quem criou).
    entidadeId: (d) => (d as { id: string } | undefined)?.id,
  },
  async (input, ctx) => {
    const r = await criarContaObraNoBanco(input, ctx.user.id);
    revalidatePath(REVALIDATE);
    return { id: r.id, email: input.email, senhaTemporaria: r.senhaTemporaria };
  },
);

/** Edita a conta de obra: nome, empresa, "é do cliente", obras e "Acesso até". */
export const salvarContaObra = defineAction(
  {
    modulo: "configuracoes",
    acao: "salvar-conta-obra",
    recurso: "usuarios",
    permissao: "gerir",
    interno: true,
    entidade: "ContaObra",
    schema: salvarContaObraSchema,
    entidadeId: (_d, i) => (i as { userId: string }).userId,
    capturarAntes: (input) => fotoDaConta(input.userId),
  },
  async (input, ctx) => {
    const r = await salvarContaObraNoBanco(input, ctx.user.id);
    revalidatePath(REVALIDATE);
    return r;
  },
);
