"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction, ActionError } from "@/lib/with-action";
import { notificarMuitos } from "@/lib/notificar";
import { SOLICITACAO_CADASTRO_ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";

const publicSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  telefone: z.string().optional(),
  // Só perfis não-privilegiados podem ser pedidos publicamente; o admin decide o vínculo real.
  role: z.enum(SOLICITACAO_CADASTRO_ROLES as [string, ...string[]]).default("cliente"),
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
    data: {
      nome: p.data.nome,
      email: p.data.email,
      telefone: p.data.telefone || null,
      role: p.data.role as Role,
      mensagem: p.data.mensagem || null,
    },
  });

  // Avisa quem processa pedidos (admin/supervisor/administrativo). Falha de push não
  // pode derrubar o envio público — o pedido já foi gravado.
  try {
    const gestores = await prisma.user.findMany({
      where: whereAudiencia("rh_admin"),
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Novo pedido de acesso",
        corpo: `${p.data.nome} (${p.data.email}) solicitou cadastro como ${ROLE_LABELS[p.data.role as Role]}.`,
        href: "/configuracoes/usuarios",
        tag: "solicitacao-cadastro",
      },
    );
  } catch (e) {
    console.error("[solicitarCadastro] falha ao notificar gestores:", e);
  }

  return { ok: true };
}

const adminBase = { modulo: "configuracoes", recurso: "usuarios", permissao: "gerir" } as const;

/**
 * Admin avalia o pedido (aprova/recusa) — NÃO cria o usuário automaticamente.
 * Ao aprovar, devolve `prefill` (nome/e-mail) para a tela abrir a criação já preenchida
 * (item 6a): reaproveita o que a pessoa digitou, sem redigitar. O admin revisa e define o vínculo.
 */
export const avaliarSolicitacaoCadastro = defineAction(
  { ...adminBase, acao: "avaliar-solicitacao-cadastro", entidade: "SolicitacaoCadastro", schema: z.object({ id: z.string().min(1), aprovar: z.boolean() }) },
  async (i) => {
    const pedido = await prisma.solicitacaoCadastro.findUnique({ where: { id: i.id } });
    if (!pedido) throw new ActionError("Pedido não encontrado.");
    await prisma.solicitacaoCadastro.update({ where: { id: i.id }, data: { status: i.aprovar ? "aprovada" : "recusada" } });
    revalidatePath("/configuracoes/usuarios");
    return {
      id: i.id,
      // Reaproveita tudo que a pessoa informou (nome/e-mail/telefone/cargo pretendido).
      prefill: i.aprovar
        ? { name: pedido.nome, email: pedido.email, telefone: pedido.telefone ?? "", role: pedido.role }
        : null,
    };
  },
);
