"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;

const salvarSchema = z.object({
  tipo: z.enum(["inss", "irrf"]),
  faixas: z
    .array(
      z.object({
        limite: z.number().positive("Limite deve ser positivo."),
        aliquota: z.number().min(0).max(100),
        deduzir: z.number().min(0).default(0),
      }),
    )
    .default([]),
});

/** Substitui todas as faixas de um tipo (inss/irrf) — replace-all transacional. */
export const salvarFaixasEncargo = defineAction(
  { ...base, acao: "salvar-faixas-encargo", entidade: "EncargoFaixa", schema: salvarSchema },
  async (i) => {
    await prisma.$transaction([
      prisma.encargoFaixa.deleteMany({ where: { tipo: i.tipo } }),
      prisma.encargoFaixa.createMany({
        data: i.faixas.map((f, ordem) => ({
          tipo: i.tipo,
          ordem,
          limite: f.limite,
          aliquota: f.aliquota,
          deduzir: f.deduzir,
        })),
      }),
    ]);
    revalidatePath("/configuracoes/encargos");
    return { tipo: i.tipo, total: i.faixas.length };
  },
);
