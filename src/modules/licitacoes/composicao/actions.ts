"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

export const salvarComposicaoLicitacao = defineAction(
  {
    ...base,
    acao: "salvar-composicao-licitacao",
    entidade: "LicitacaoComposicaoPreco",
    schema: z.object({
      licitacaoId: z.string().min(1),
      observacao: z.string().optional().or(z.literal("")),
      itens: z
        .array(
          z.object({
            descricao: z.string().min(1),
            quantidade: z.number().min(0),
            valorUnitario: z.number().min(0),
          }),
        )
        .max(200),
    }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const comp = await tx.licitacaoComposicaoPreco.upsert({
        where: { licitacaoId: i.licitacaoId },
        create: { licitacaoId: i.licitacaoId, observacao: i.observacao || null },
        update: { observacao: i.observacao || null },
      });
      await tx.itemComposicaoLicitacao.deleteMany({ where: { composicaoId: comp.id } });
      if (i.itens.length > 0) {
        await tx.itemComposicaoLicitacao.createMany({
          data: i.itens.map((it, n) => ({
            composicaoId: comp.id,
            descricao: it.descricao,
            quantidade: it.quantidade,
            valorUnitario: it.valorUnitario,
            ordem: n,
          })),
        });
      }
    });
    rev();
    return { ok: true };
  },
);
