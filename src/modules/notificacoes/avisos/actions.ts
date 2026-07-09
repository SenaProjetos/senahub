"use server";

import { defineAction, ActionError } from "@/lib/with-action";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { emitParaUsuario } from "@/lib/socket";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { renderTemplate } from "@/lib/email-templates";
import { criarAvisoSchema } from "./schemas";
import { resolverDestinatarios, rolesValidas } from "./service";
import { avisosPendentes } from "./queries";

/**
 * Cria um aviso geral direcionado. Persiste o aviso + 1 linha por destinatário,
 * dispara sino/push, emite o modal ao vivo (socket) e, opcionalmente, e-mail.
 * Substitui o antigo `enviarAvisoGeral` (só sino/push, sem confirmação).
 */
export const criarAviso = defineAction(
  {
    modulo: "configuracoes",
    recurso: "avisos",
    permissao: "enviar",
    acao: "criar-aviso",
    entidade: "Aviso",
    schema: criarAvisoSchema,
    entidadeId: (data) => (data as { id?: string }).id,
  },
  async (i, ctx) => {
    const destinatarios = await resolverDestinatarios(i, ctx.user.id);
    if (destinatarios.length === 0) {
      throw new ActionError("Nenhum destinatário para o alvo escolhido.");
    }

    const aviso = await prisma.aviso.create({
      data: {
        titulo: i.titulo,
        corpo: i.corpo || null,
        criadoPorId: ctx.user.id,
        alvoTipo: i.alvoTipo,
        alvoRoles: i.alvoTipo === "categoria" ? rolesValidas(i.alvoRoles) : [],
        exigeConfirmacao: i.exigeConfirmacao,
        destinatarios: { create: destinatarios.map((userId) => ({ userId })) },
      },
    });

    // Sino + Web Push interno (reusa a fan-out existente).
    await notificarMuitos(destinatarios, {
      titulo: i.titulo,
      corpo: i.corpo || undefined,
      href: "/",
      tag: `aviso-${aviso.id}`,
    });

    // Modal ao vivo para quem está online (offline pega no próximo login).
    for (const userId of destinatarios) {
      emitParaUsuario(userId, "aviso-novo", { avisoId: aviso.id });
    }

    // E-mail opcional aos destinatários com endereço.
    let comEmail = 0;
    if (i.enviarEmail && smtpConfigurado()) {
      const users = await prisma.user.findMany({
        where: { id: { in: destinatarios }, email: { not: "" } },
        select: { email: true },
      });
      const tpl = await renderTemplate("aviso-geral", {
        titulo: i.titulo,
        corpo: i.corpo || "",
      });
      for (const u of users) {
        const ok = await enviarEmail({ to: u.email, subject: tpl.assunto, html: tpl.html });
        if (ok) comEmail++;
      }
      if (comEmail > 0) {
        await prisma.aviso.update({ where: { id: aviso.id }, data: { enviouEmail: true } });
      }
    }

    return { id: aviso.id, total: destinatarios.length, comEmail };
  },
);

/** Confirma leitura do aviso para o usuário atual (idempotente). */
export async function confirmarLeituraAviso(avisoId: string) {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.avisoDestinatario.updateMany({
    where: { avisoId, userId: session.user.id, lidoEm: null },
    data: { lidoEm: new Date() },
  });
  return { ok: true };
}

/** Fila de avisos pendentes do usuário atual (usada pelo provider client). */
export async function buscarAvisosPendentes() {
  const session = await getSession();
  if (!session) return [];
  return avisosPendentes(session.user.id);
}
