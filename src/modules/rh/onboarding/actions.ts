"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;

const criarSchema = z.object({ userId: z.string().min(1), templateId: z.string().min(1) });
const toggleSchema = z.object({ id: z.string().min(1), concluido: z.boolean() });
const idSchema = z.object({ id: z.string().min(1) });

/** Inicia o onboarding de um colaborador a partir de um template. */
export const criarOnboarding = defineAction(
  { ...base, acao: "criar-onboarding", entidade: "OnboardingProcesso", schema: criarSchema },
  async (i) => {
    const existe = await prisma.onboardingProcesso.findUnique({ where: { userId: i.userId } });
    if (existe) throw new ActionError("Colaborador já tem onboarding.");
    const tpl = await prisma.onboardingTemplate.findUnique({
      where: { id: i.templateId },
      include: { itens: { orderBy: { ordem: "asc" } } },
    });
    if (!tpl) throw new ActionError("Template não encontrado.");

    const proc = await prisma.onboardingProcesso.create({
      data: {
        userId: i.userId,
        templateId: tpl.id,
        itens: {
          create: tpl.itens.map((it) => ({ descricao: it.descricao, ordem: it.ordem })),
        },
      },
    });
    revalidatePath("/rh/admin");
    return { id: proc.id };
  },
);

export const toggleOnboardingItem = defineAction(
  { ...base, acao: "toggle-onboarding-item", entidade: "OnboardingItem", schema: toggleSchema },
  async (i) => {
    await prisma.onboardingItem.update({
      where: { id: i.id },
      data: { concluido: i.concluido, concluidoEm: i.concluido ? new Date() : null },
    });
    revalidatePath("/rh/admin");
    revalidatePath("/rh");
    return { id: i.id };
  },
);

export const removerOnboarding = defineAction(
  { ...base, acao: "remover-onboarding", entidade: "OnboardingProcesso", schema: idSchema },
  async (i) => {
    await prisma.onboardingProcesso.delete({ where: { id: i.id } });
    revalidatePath("/rh/admin");
    return { id: i.id };
  },
);
