"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/funcionarios");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

export const adicionarDependente = defineAction(
  {
    ...base,
    acao: "add-dependente",
    entidade: "Dependente",
    schema: z.object({
      userId: z.string().min(1),
      nome: z.string().min(1, "Informe o nome."),
      nascimento: opt(z.string()),
      parentesco: opt(z.string()),
    }),
  },
  async (i) => {
    const d = await prisma.dependente.create({
      data: {
        userId: i.userId,
        nome: i.nome,
        nascimento: i.nascimento ? new Date(i.nascimento + "T00:00:00Z") : null,
        parentesco: i.parentesco || null,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const removerDependente = defineAction(
  { ...base, acao: "rm-dependente", entidade: "Dependente", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.dependente.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
