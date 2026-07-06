"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
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
// Ponto manual (registrarPontoManual) foi substituído pelo ajuste de dia com
// reconciliação de sessões e ciência do colaborador — ver
// modules/ponto/actions.ts (ajustarPontoEquipe) e a tela /ponto/espelho.
