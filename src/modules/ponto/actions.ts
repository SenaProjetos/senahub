"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "rh" } as const;
const rev = () => revalidatePath("/ponto");

const projetoOpt = z.object({ projetoId: z.string().optional().or(z.literal("")) });

/** Inicia a jornada (abre o cronômetro). Erro se já houver sessão aberta. */
export const baterPonto = defineAction(
  { ...base, acao: "bater-ponto", entidade: "SessaoTrabalho", schema: projetoOpt },
  async (i, { user }) => {
    const aberta = await prisma.sessaoTrabalho.findFirst({ where: { userId: user.id, fim: null } });
    if (aberta) throw new ActionError("Jornada já iniciada. Encerre antes de bater novo ponto.");
    const s = await prisma.sessaoTrabalho.create({
      data: { userId: user.id, projetoId: i.projetoId || null, inicio: new Date() },
    });
    rev();
    return { id: s.id };
  },
);

/**
 * Troca de projeto durante a jornada: fecha a sessão atual (contabiliza o tempo)
 * e abre nova sessão no projeto escolhido. Resolve a dor histórica.
 */
export const trocarProjeto = defineAction(
  { ...base, acao: "trocar-projeto", entidade: "SessaoTrabalho", schema: projetoOpt },
  async (i, { user }) => {
    const aberta = await prisma.sessaoTrabalho.findFirst({ where: { userId: user.id, fim: null } });
    if (!aberta) throw new ActionError("Nenhuma jornada aberta.");
    const agora = new Date();
    await prisma.$transaction([
      prisma.sessaoTrabalho.update({ where: { id: aberta.id }, data: { fim: agora } }),
      prisma.sessaoTrabalho.create({
        data: { userId: user.id, projetoId: i.projetoId || null, inicio: agora },
      }),
    ]);
    rev();
    return { ok: true };
  },
);

/** Encerra a jornada (fecha a sessão aberta). */
export const encerrarJornada = defineAction(
  { ...base, acao: "encerrar-jornada", entidade: "SessaoTrabalho", schema: z.object({}) },
  async (_i, { user }) => {
    const aberta = await prisma.sessaoTrabalho.findFirst({ where: { userId: user.id, fim: null } });
    if (!aberta) throw new ActionError("Nenhuma jornada aberta.");
    await prisma.sessaoTrabalho.update({ where: { id: aberta.id }, data: { fim: new Date() } });
    rev();
    return { id: aberta.id };
  },
);
