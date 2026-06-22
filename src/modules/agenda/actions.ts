"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES } from "@/lib/roles";
import { notificarMuitos } from "@/lib/notificar";

const base = { modulo: "agenda", roles: INTERNAL_ROLES } as const;
const rev = () => revalidatePath("/agenda");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const compromissoSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  descricao: opt(z.string()),
  local: opt(z.string()),
  inicio: z.string().min(1, "Informe data/hora."),
  fim: opt(z.string()),
  participantesIds: z.array(z.string()).default([]),
});
const idSchema = z.object({ id: z.string().min(1) });
const confirmarSchema = z.object({ id: z.string().min(1), confirmado: z.boolean() });

export const criarCompromisso = defineAction(
  { ...base, acao: "criar-compromisso", entidade: "Compromisso", schema: compromissoSchema },
  async (i, { user }) => {
    const c = await prisma.compromisso.create({
      data: {
        titulo: i.titulo,
        descricao: i.descricao || null,
        local: i.local || null,
        inicio: new Date(i.inicio),
        fim: i.fim ? new Date(i.fim) : null,
        criadorId: user.id,
        participantes: {
          create: [...new Set([user.id, ...i.participantesIds])].map((userId) => ({
            userId,
            confirmado: userId === user.id ? true : null,
          })),
        },
      },
    });
    const convidados = i.participantesIds.filter((id) => id !== user.id);
    if (convidados.length > 0) {
      await notificarMuitos(convidados, {
        titulo: "Convite de agenda",
        corpo: `${i.titulo} — ${new Date(i.inicio).toLocaleString("pt-BR")}`,
        href: "/agenda",
        tag: `agenda-${c.id}`,
      });
    }
    rev();
    return { id: c.id };
  },
);

export const confirmarPresenca = defineAction(
  { ...base, acao: "confirmar-presenca", entidade: "CompromissoParticipante", schema: confirmarSchema },
  async (i, { user }) => {
    const p = await prisma.compromissoParticipante.findFirst({
      where: { compromissoId: i.id, userId: user.id },
    });
    if (!p) throw new ActionError("Você não foi convidado.");
    await prisma.compromissoParticipante.update({
      where: { id: p.id },
      data: { confirmado: i.confirmado },
    });
    rev();
    return { id: i.id };
  },
);

const editarCompromissoSchema = compromissoSchema.extend({ id: z.string().min(1) });

export const editarCompromisso = defineAction(
  { ...base, acao: "editar-compromisso", entidade: "Compromisso", schema: editarCompromissoSchema },
  async (i, { user }) => {
    const c = await prisma.compromisso.findUnique({ where: { id: i.id } });
    if (!c) throw new ActionError("Compromisso não encontrado.");
    if (c.criadorId !== user.id && user.role !== "admin") {
      throw new ActionError("Só o criador pode editar.");
    }
    const existentesAntes = await prisma.compromissoParticipante.findMany({
      where: { compromissoId: i.id },
      select: { userId: true },
    });
    const idsAntes = new Set(existentesAntes.map((p) => p.userId));
    const novosIds = new Set([...i.participantesIds, user.id]);

    await prisma.$transaction(async (tx) => {
      await tx.compromisso.update({
        where: { id: i.id },
        data: {
          titulo: i.titulo,
          descricao: i.descricao || null,
          local: i.local || null,
          inicio: new Date(i.inicio),
          fim: i.fim ? new Date(i.fim) : null,
        },
      });
      const paraAdicionar = [...novosIds].filter((id) => !idsAntes.has(id));
      const paraRemoverIds = [...idsAntes].filter((id) => !novosIds.has(id));
      if (paraRemoverIds.length > 0) {
        await tx.compromissoParticipante.deleteMany({
          where: { compromissoId: i.id, userId: { in: paraRemoverIds } },
        });
      }
      if (paraAdicionar.length > 0) {
        await tx.compromissoParticipante.createMany({
          data: paraAdicionar.map((userId) => ({ compromissoId: i.id, userId, confirmado: null })),
        });
      }
    });

    const novosConvidados = i.participantesIds.filter((id) => id !== user.id && !idsAntes.has(id));
    if (novosConvidados.length > 0) {
      await notificarMuitos(novosConvidados, {
        titulo: "Convite de agenda atualizado",
        corpo: `${i.titulo} — ${new Date(i.inicio).toLocaleString("pt-BR")}`,
        href: "/agenda",
        tag: `agenda-${i.id}`,
      });
    }
    rev();
    return { id: i.id };
  },
);

export const excluirCompromisso = defineAction(
  { ...base, acao: "excluir-compromisso", entidade: "Compromisso", schema: idSchema },
  async (i, { user }) => {
    const c = await prisma.compromisso.findUnique({ where: { id: i.id } });
    if (!c) throw new ActionError("Compromisso não encontrado.");
    if (c.criadorId !== user.id && user.role !== "admin") {
      throw new ActionError("Só o criador pode excluir.");
    }
    await prisma.compromisso.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
