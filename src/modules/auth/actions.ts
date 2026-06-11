"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit, getClientIp } from "@/lib/audit";
import { notificarAdmins } from "@/lib/notifications";

const emailSchema = z.object({ email: z.string().email() });

/**
 * Solicitação pública de reset de senha. Nunca revela se o e-mail existe.
 * - E-mail registrado: notifica admins indicando qual usuário pediu.
 * - E-mail desconhecido: notifica admins indicando o e-mail informado.
 */
export async function solicitarResetSenha(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false as const, message: "E-mail inválido." };
  }
  const email = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email } });

  await prisma.solicitacaoResetSenha.create({
    data: { email, userId: user?.id ?? null },
  });

  if (user) {
    await notificarAdmins({
      titulo: "Solicitação de reset de senha",
      corpo: `${user.name} (${email}) solicitou redefinição de senha.`,
      href: "/configuracoes/usuarios",
    });
  } else {
    await notificarAdmins({
      titulo: "Reset de senha — e-mail não registrado",
      corpo: `Tentativa de redefinição para e-mail não cadastrado: ${email}.`,
      href: "/configuracoes/usuarios",
    });
  }

  await logAudit({
    userId: user?.id ?? null,
    modulo: "auth",
    acao: "solicitar-reset-senha",
    tipo: "acao",
    entidade: "SolicitacaoResetSenha",
    detalhe: { email, registrado: Boolean(user) },
    ip: await getClientIp(),
  });

  return {
    ok: true as const,
    message: "Se o e-mail estiver cadastrado, a administração foi notificada.",
  };
}

const trocarSenhaSchema = z
  .object({
    novaSenha: z.string().min(8, "Mínimo de 8 caracteres."),
    confirmar: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmar, {
    message: "As senhas não coincidem.",
    path: ["confirmar"],
  });

/** Troca de senha do próprio usuário (1º acesso ou voluntária). */
export async function trocarSenha(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = trocarSenhaSchema.safeParse({
    novaSenha: formData.get("novaSenha"),
    confirmar: formData.get("confirmar"),
  });
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]!.message };
  }

  // better-auth: define nova senha do provedor de credenciais.
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(parsed.data.novaSenha);
  await ctx.internalAdapter.updatePassword(session.user.id, hash);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { mustChangePassword: false },
  });

  await logAudit({
    userId: session.user.id,
    modulo: "auth",
    acao: "trocar-senha",
    tipo: "acao",
    entidade: "User",
    entidadeId: session.user.id,
    ip: await getClientIp(),
  });

  // Revalida a navegação para refletir mustChangePassword=false.
  await headers();
  redirect("/");
}
