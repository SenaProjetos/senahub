"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { notificar, notificarMuitos } from "@/lib/notificar";

const rev = () => revalidatePath("/suporte");

const ticketSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  descricao: z.string().min(1, "Descreva o problema."),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
  // "Tipo" do ticket (Mód 13): Sugestão/Erro vindos do sistema antigo + legados mantidos p/ compatibilidade.
  categoria: z.enum(["sugestao", "erro", "duvida", "melhoria", "acesso", "outro"]).default("outro"),
});
const mensagemSchema = z
  .object({
    ticketId: z.string().min(1),
    texto: z.string().max(4000).default(""),
    anexoPath: z.string().optional(),
    anexoNome: z.string().optional(),
    anexoMime: z.string().optional(),
  })
  .refine((v) => v.texto.trim().length > 0 || !!v.anexoPath, { message: "Mensagem vazia.", path: ["texto"] });
const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["aberto", "em_atendimento", "resolvido"]),
});

/** Qualquer usuário autenticado abre ticket. */
export const abrirTicket = defineAction(
  { modulo: "suporte", acao: "abrir-ticket", entidade: "TicketSuporte", schema: ticketSchema },
  async (i, { user }) => {
    const t = await prisma.ticketSuporte.create({
      data: {
        titulo: i.titulo,
        descricao: i.descricao,
        prioridade: i.prioridade,
        categoria: i.categoria,
        autorId: user.id,
      },
    });
    const gestores = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor"] } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      { titulo: "Novo ticket de suporte", corpo: i.titulo, href: "/suporte", tag: `ticket-${t.id}` },
    );
    rev();
    return { id: t.id };
  },
);

export const responderTicket = defineAction(
  { modulo: "suporte", acao: "responder-ticket", entidade: "TicketMensagem", schema: mensagemSchema },
  async (i, { user }) => {
    const t = await prisma.ticketSuporte.findUnique({ where: { id: i.ticketId } });
    if (!t) throw new ActionError("Ticket não encontrado.");
    await prisma.ticketMensagem.create({
      data: {
        ticketId: i.ticketId,
        autorId: user.id,
        texto: i.texto,
        anexoPath: i.anexoPath || null,
        anexoNome: i.anexoNome || null,
        anexoMime: i.anexoMime || null,
      },
    });
    if (t.autorId !== user.id) {
      await notificar(t.autorId, {
        titulo: "Resposta no seu ticket",
        corpo: i.texto ? i.texto.slice(0, 80) : "📎 Anexo",
        href: "/suporte",
        tag: `ticket-${t.id}`,
      });
    }
    rev();
    return { ticketId: i.ticketId };
  },
);

/** Mudar status: gestores. */
export const mudarStatusTicket = defineAction(
  {
    modulo: "suporte",
    roles: HR_ADMIN_ROLES,
    acao: "status-ticket",
    entidade: "TicketSuporte",
    schema: statusSchema,
  },
  async (i, { user }) => {
    const t = await prisma.ticketSuporte.findUnique({ where: { id: i.id } });
    if (!t) throw new ActionError("Ticket não encontrado.");
    if (t.status !== i.status) {
      await prisma.ticketSuporte.update({ where: { id: i.id }, data: { status: i.status } });
      // Avisa o autor quando outra pessoa altera o status do ticket.
      if (t.autorId !== user.id) {
        const rotulos: Record<string, string> = {
          aberto: "Aberto",
          em_atendimento: "Em atendimento",
          resolvido: "Resolvido",
        };
        await notificar(t.autorId, {
          titulo: "Status do seu ticket atualizado",
          corpo: `${t.titulo} → ${rotulos[i.status] ?? i.status}`,
          href: "/suporte",
          tag: `ticket-${t.id}`,
        });
      }
    }
    rev();
    return { id: i.id };
  },
);
