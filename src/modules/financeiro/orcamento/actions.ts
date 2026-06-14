"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

/** Define (upsert) o valor orçado de uma categoria para um ano. Valor 0 remove o item. */
export const salvarOrcamentoItem = defineAction(
  {
    ...base,
    acao: "salvar-orcamento-item",
    entidade: "OrcamentoItem",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      categoriaId: z.string().min(1),
      valorPlanejado: z.number().min(0),
    }),
  },
  async (i) => {
    if (i.valorPlanejado <= 0) {
      await prisma.orcamentoItem.deleteMany({ where: { ano: i.ano, categoriaId: i.categoriaId } });
    } else {
      await prisma.orcamentoItem.upsert({
        where: { ano_categoriaId: { ano: i.ano, categoriaId: i.categoriaId } },
        create: { ano: i.ano, categoriaId: i.categoriaId, valorPlanejado: i.valorPlanejado },
        update: { valorPlanejado: i.valorPlanejado },
      });
    }
    revalidatePath("/financeiro/orcamento");
    return { ok: true };
  },
);
