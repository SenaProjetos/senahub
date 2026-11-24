"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { APIError } from "better-auth/api";
import { logAudit, getClientIp } from "@/lib/audit";
import { MENSAGEM_LINK_INVALIDO, MENSAGEM_PEDIDO, tokenBemFormado } from "./redefinir-senha";
import {
  invalidarLinksDeRedefinicao,
  ipDoContexto,
  limitarGravacaoPorIp,
  limitarPedidoPorIp,
} from "./redefinir-senha-service";

// campo-ok: e-mail de login (better-auth)
const emailSchema = z.object({ email: z.string().trim().max(254).email() });

/**
 * "Esqueci minha senha" (público). Pede ao better-auth um link por e-mail — o envio, a trava por
 * pessoa e o aviso aos admins quando o e-mail não sai ficam em `redefinir-senha-service.ts`.
 * A resposta é sempre a mesma: nunca revela se o e-mail existe, nem se o envio foi barrado.
 */
export async function solicitarResetSenha(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false as const, message: "E-mail inválido." };
  }
  const email = parsed.data.email.toLowerCase();
  const ip = await ipDoContexto();
  const resposta = { ok: true as const, message: MENSAGEM_PEDIDO };

  // Trava por IP ANTES de gravar: quem passou do limite não enche a tabela nem a trilha (só o
  // primeiro bloqueio da janela é auditado).
  const limite = limitarPedidoPorIp(ip);
  if (!limite.permitido) {
    if (limite.primeiroBloqueio) {
      await logAudit({
        modulo: "auth",
        acao: "solicitar-reset-senha",
        resultado: "bloqueado",
        entidade: "SolicitacaoResetSenha",
        detalhe: { motivo: "rate_limit" },
        ip,
      });
    }
    return resposta;
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  await prisma.solicitacaoResetSenha.create({ data: { email, userId: user?.id ?? null } });
  await logAudit({
    userId: user?.id ?? null,
    modulo: "auth",
    acao: "solicitar-reset-senha",
    tipo: "acao",
    entidade: "SolicitacaoResetSenha",
    detalhe: { email, registrado: Boolean(user) },
    ip,
  });

  try {
    await auth.api.requestPasswordReset({ body: { email }, headers: await headers() });
  } catch (err) {
    console.error("[redefinir-senha] pedido do link falhou:", err);
  }
  return resposta;
}

const novaSenhaCampo = z
  .string({ error: "Digite a nova senha." })
  .min(8, "Mínimo de 8 caracteres.")
  .max(128, "Máximo de 128 caracteres.");
const confirmarCampo = z.string({ error: "Confirme a nova senha." });

const redefinirSchema = z
  .object({ novaSenha: novaSenhaCampo, confirmar: confirmarCampo })
  .refine((d) => d.novaSenha === d.confirmar, {
    message: "As senhas não coincidem.",
    path: ["confirmar"],
  });

type ResultadoRedefinir = { ok: true } | { ok: false; message: string; linkInvalido?: boolean };

/**
 * Grava a senha nova pelo link do e-mail (público, sem sessão). O better-auth consome o token,
 * grava a senha, chama `aposRedefinirPeloLink` (auditoria) e derruba todas as sessões.
 * `linkInvalido` faz a tela trocar o formulário pelo aviso de link vencido.
 */
export async function redefinirSenhaPeloLink(formData: FormData): Promise<ResultadoRedefinir> {
  const ip = await ipDoContexto();
  const limite = limitarGravacaoPorIp(ip);
  if (!limite.permitido) {
    if (limite.primeiroBloqueio) {
      await logAudit({ modulo: "auth", acao: "redefinir-senha-por-link", resultado: "bloqueado", detalhe: { motivo: "rate_limit" }, ip });
    }
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  const token = formData.get("token");
  if (!tokenBemFormado(token)) {
    await logAudit({ modulo: "auth", acao: "redefinir-senha-por-link", resultado: "rejeitado", detalhe: { motivo: "link_malformado" }, ip });
    return { ok: false, message: MENSAGEM_LINK_INVALIDO, linkInvalido: true };
  }
  const parsed = redefinirSchema.safeParse({
    novaSenha: formData.get("novaSenha"),
    confirmar: formData.get("confirmar"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  try {
    await auth.api.resetPassword({
      body: { token, newPassword: parsed.data.novaSenha },
      headers: await headers(),
    });
  } catch (err) {
    // O comprimento já foi validado acima: o que o better-auth recusa aqui é o token.
    if (err instanceof APIError) {
      await logAudit({ modulo: "auth", acao: "redefinir-senha-por-link", resultado: "rejeitado", detalhe: { motivo: "link_invalido" }, ip });
      return { ok: false, message: MENSAGEM_LINK_INVALIDO, linkInvalido: true };
    }
    console.error("[redefinir-senha] falha ao gravar a senha:", err);
    return { ok: false, message: "Não foi possível salvar a senha. Tente novamente." };
  }
  return { ok: true };
}

const trocarSenhaSchema = z
  .object({
    novaSenha: z.string({ error: "Digite a nova senha." }).min(8, "Mínimo de 8 caracteres."),
    confirmar: confirmarCampo,
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

  // Se a senha vazou/foi comprometida, troca-la deve derrubar sessões em
  // outros dispositivos. Mantém a sessão atual (a que acabou de trocar).
  await auth.api.revokeOtherSessions({ headers: await headers() });
  // Link de "Esqueci minha senha" pedido antes (talvez por quem tem o e-mail) não pode sobrescrever esta.
  await invalidarLinksDeRedefinicao(session.user.id);

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
    detalhe: { sessoesOutrasRevogadas: true },
    ip: await getClientIp(),
  });

  // Revalida a navegação para refletir mustChangePassword=false.
  await headers();
  redirect("/");
}
