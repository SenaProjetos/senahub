"use server";

import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";

/**
 * Aviso geral: usuário autorizado (`avisos:enviar`) envia uma notificação
 * para todos os usuários ativos (sino + push). Por padrão exclui clientes.
 */
export const enviarAvisoGeral = defineAction(
  {
    modulo: "configuracoes",
    recurso: "avisos",
    permissao: "enviar",
    acao: "aviso-geral",
    entidade: "Notificacao",
    schema: z.object({
      titulo: z.string().min(1, "Informe o título."),
      corpo: z.string().optional().or(z.literal("")),
      incluirClientes: z.boolean().default(false),
    }),
  },
  async (i, ctx) => {
    const users = await prisma.user.findMany({
      where: i.incluirClientes ? { ativo: true } : { ativo: true, role: { not: "cliente" } },
      select: { id: true },
    });
    const destinatarios = users.map((u) => u.id).filter((id) => id !== ctx.user.id);
    await notificarMuitos(destinatarios, {
      titulo: i.titulo,
      corpo: i.corpo || undefined,
      href: "/",
      tag: "aviso-geral",
    });
    return { destinatarios: destinatarios.length };
  },
);
