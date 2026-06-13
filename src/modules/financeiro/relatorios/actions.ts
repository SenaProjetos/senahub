"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  categoriaId: z.string().min(1),
  grupo: z.enum(["operacional", "investimento", "financiamento"]),
});

/** Classifica a atividade da categoria no DFC. */
export const classificarDfc = defineAction(
  { modulo: "financeiro", recurso: "financeiro", permissao: "gerir", acao: "classificar-dfc", entidade: "CategoriaFinanceira", schema },
  async (i) => {
    await prisma.categoriaFinanceira.update({
      where: { id: i.categoriaId },
      data: { grupoDfc: i.grupo },
    });
    revalidatePath("/financeiro/dfc");
    return { id: i.categoriaId };
  },
);
