"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/admin");

// ── D5 Feedback RH ────────────────────────────────────────────
export const registrarFeedback = defineAction(
  {
    ...base,
    acao: "registrar-feedback",
    entidade: "FeedbackRH",
    schema: z.object({
      userId: z.string().min(1),
      tipo: z.enum(["feedback", "reuniao_1a1", "reconhecimento", "alerta"]),
      conteudo: z.string().min(1, "Escreva o feedback."),
    }),
  },
  async (i, ctx) => {
    const f = await prisma.feedbackRH.create({ data: { userId: i.userId, autorId: ctx.user.id, tipo: i.tipo, conteudo: i.conteudo } });
    rev();
    return { id: f.id };
  },
);

export const removerFeedback = defineAction(
  { ...base, acao: "remover-feedback", entidade: "FeedbackRH", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.feedbackRH.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── D7 Ponto manual (lançamento/correção de sessão) ───────────
export const registrarPontoManual = defineAction(
  {
    ...base,
    acao: "registrar-ponto-manual",
    entidade: "SessaoTrabalho",
    schema: z.object({
      userId: z.string().min(1),
      projetoId: z.string().optional().or(z.literal("")),
      inicio: z.string().min(1, "Informe o início."),
      fim: z.string().min(1, "Informe o fim."),
    }),
  },
  async (i) => {
    const inicio = new Date(i.inicio);
    const fim = new Date(i.fim);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) throw new ActionError("Datas inválidas.");
    if (fim <= inicio) throw new ActionError("O fim deve ser após o início.");
    const s = await prisma.sessaoTrabalho.create({
      data: { userId: i.userId, projetoId: i.projetoId || null, inicio, fim },
    });
    revalidatePath("/rh/admin");
    revalidatePath("/ponto");
    return { id: s.id };
  },
);
