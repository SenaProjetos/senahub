"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction } from "@/lib/with-action";

const publicSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  telefone: z.string().optional(),
  mensagem: z.string().optional(),
});

/** Auto-cadastro PÚBLICO (sem sessão) — cria um pedido para o admin avaliar (E7). */
export async function solicitarCadastro(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = publicSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos." };

  // Evita duplicar pedido pendente do mesmo e-mail.
  const existe = await prisma.solicitacaoCadastro.findFirst({ where: { email: p.data.email, status: "pendente" } });
  if (existe) return { ok: true };

  await prisma.solicitacaoCadastro.create({
    data: { nome: p.data.nome, email: p.data.email, telefone: p.data.telefone || null, mensagem: p.data.mensagem || null },
  });
  return { ok: true };
}

const adminBase = { modulo: "configuracoes", recurso: "usuarios", permissao: "gerir" } as const;

/** Admin avalia o pedido de cadastro (aprova/recusa) — não cria o usuário automaticamente. */
export const avaliarSolicitacaoCadastro = defineAction(
  { ...adminBase, acao: "avaliar-solicitacao-cadastro", entidade: "SolicitacaoCadastro", schema: z.object({ id: z.string().min(1), aprovar: z.boolean() }) },
  async (i) => {
    await prisma.solicitacaoCadastro.update({ where: { id: i.id }, data: { status: i.aprovar ? "aprovada" : "recusada" } });
    revalidatePath("/configuracoes/usuarios");
    return { id: i.id };
  },
);
