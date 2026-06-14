"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES } from "@/lib/roles";
import { notificarMuitos } from "@/lib/notificar";

const base = { modulo: "tarefas", roles: INTERNAL_ROLES } as const;
const rev = () => revalidatePath("/tarefas");

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const tarefaSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  descricao: opt(z.string()),
  statusId: z.string().min(1),
  prazo: opt(z.string()),
  projetoId: opt(z.string()),
  responsaveisIds: z.array(z.string()).default([]),
  itens: z.array(z.object({ descricao: z.string().min(1), concluido: z.boolean() })).default([]),
  dependeDeIds: z.array(z.string()).default([]),
});
const editarSchema = tarefaSchema.extend({ id: z.string().min(1) });
const moverSchema = z.object({ id: z.string().min(1), statusId: z.string().min(1) });
const idSchema = z.object({ id: z.string().min(1) });
const toggleItemSchema = z.object({ id: z.string().min(1), concluido: z.boolean() });

export const criarTarefa = defineAction(
  { ...base, acao: "criar-tarefa", entidade: "Tarefa", schema: tarefaSchema },
  async (i, { user }) => {
    const t = await prisma.tarefa.create({
      data: {
        titulo: i.titulo,
        descricao: i.descricao || null,
        statusId: i.statusId,
        prazo: i.prazo ? new Date(i.prazo) : null,
        projetoId: i.projetoId || null,
        criadorId: user.id,
        responsaveis: { create: i.responsaveisIds.map((userId) => ({ userId })) },
        itens: { create: i.itens.map((it, idx) => ({ ...it, ordem: idx })) },
        dependeDe: { create: i.dependeDeIds.map((dependeDeId) => ({ dependeDeId })) },
      },
    });
    if (i.responsaveisIds.length > 0) {
      await notificarMuitos(i.responsaveisIds, {
        titulo: "Nova tarefa atribuída",
        corpo: i.titulo,
        href: "/tarefas",
        tag: `tarefa-${t.id}`,
      });
    }
    rev();
    return { id: t.id };
  },
);

export const editarTarefa = defineAction(
  { ...base, acao: "editar-tarefa", entidade: "Tarefa", schema: editarSchema },
  async (i) => {
    const { id, ...r } = i;
    if (r.dependeDeIds.includes(id)) throw new ActionError("Tarefa não pode depender dela mesma.");
    await prisma.$transaction([
      prisma.tarefa.update({
        where: { id },
        data: {
          titulo: r.titulo,
          descricao: r.descricao || null,
          statusId: r.statusId,
          prazo: r.prazo ? new Date(r.prazo) : null,
          projetoId: r.projetoId || null,
        },
      }),
      prisma.tarefaResponsavel.deleteMany({ where: { tarefaId: id } }),
      prisma.tarefaResponsavel.createMany({
        data: r.responsaveisIds.map((userId) => ({ tarefaId: id, userId })),
        skipDuplicates: true,
      }),
      prisma.tarefaItem.deleteMany({ where: { tarefaId: id } }),
      prisma.tarefaItem.createMany({
        data: r.itens.map((it, idx) => ({ tarefaId: id, ...it, ordem: idx })),
      }),
      prisma.tarefaDependencia.deleteMany({ where: { tarefaId: id } }),
      prisma.tarefaDependencia.createMany({
        data: r.dependeDeIds.map((dependeDeId) => ({ tarefaId: id, dependeDeId })),
        skipDuplicates: true,
      }),
    ]);
    rev();
    return { id };
  },
);

/** Drag do Kanban. Bloqueada não entra em coluna concluída. */
export const moverTarefa = defineAction(
  { ...base, acao: "mover-tarefa", entidade: "Tarefa", schema: moverSchema },
  async (i) => {
    const destino = await prisma.tarefaStatus.findUnique({ where: { id: i.statusId } });
    if (!destino) throw new ActionError("Status não encontrado.");
    if (destino.concluido) {
      const deps = await prisma.tarefaDependencia.findMany({
        where: { tarefaId: i.id },
        include: { dependeDe: { select: { status: { select: { concluido: true } } } } },
      });
      if (deps.some((d) => !d.dependeDe.status.concluido)) {
        throw new ActionError("Tarefa bloqueada: conclua as dependências primeiro.");
      }
    }
    await prisma.tarefa.update({ where: { id: i.id }, data: { statusId: i.statusId } });
    rev();
    return { id: i.id };
  },
);

export const toggleItemTarefa = defineAction(
  { ...base, acao: "toggle-item-tarefa", entidade: "TarefaItem", schema: toggleItemSchema },
  async (i) => {
    await prisma.tarefaItem.update({ where: { id: i.id }, data: { concluido: i.concluido } });
    rev();
    return { id: i.id };
  },
);

export const arquivarTarefa = defineAction(
  { ...base, acao: "arquivar-tarefa", entidade: "Tarefa", schema: idSchema },
  async (i) => {
    await prisma.tarefa.update({ where: { id: i.id }, data: { arquivada: true } });
    rev();
    return { id: i.id };
  },
);

const comentarioSchema = z
  .object({
    tarefaId: z.string().min(1),
    texto: z.string().max(2000).default(""),
    anexoPath: z.string().optional(),
    anexoNome: z.string().optional(),
    anexoMime: z.string().optional(),
  })
  .refine((v) => v.texto.trim().length > 0 || !!v.anexoPath, { message: "Comentário vazio.", path: ["texto"] });

export const comentarTarefa = defineAction(
  { ...base, acao: "comentar-tarefa", entidade: "TarefaComentario", schema: comentarioSchema },
  async (i, { user }) => {
    const c = await prisma.tarefaComentario.create({
      data: {
        tarefaId: i.tarefaId,
        autorId: user.id,
        texto: i.texto,
        anexoPath: i.anexoPath || null,
        anexoNome: i.anexoNome || null,
        anexoMime: i.anexoMime || null,
      },
    });
    rev();
    return { id: c.id };
  },
);

export const removerComentario = defineAction(
  { ...base, acao: "rm-comentario-tarefa", entidade: "TarefaComentario", schema: idSchema },
  async (i, { user }) => {
    const c = await prisma.tarefaComentario.findUnique({ where: { id: i.id }, select: { autorId: true } });
    if (!c) throw new ActionError("Comentário não encontrado.");
    if (c.autorId !== user.id && user.role !== "admin") throw new ActionError("Só o autor remove.");
    await prisma.tarefaComentario.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
