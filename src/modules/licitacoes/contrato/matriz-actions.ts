"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

export const salvarMatrizRisco = defineAction(
  {
    ...base,
    acao: "salvar-matriz-risco",
    entidade: "MatrizRiscoItem",
    schema: z.object({
      licitacaoId: z.string().min(1),
      itens: z.array(z.object({
        evento: z.string().min(1),
        probabilidade: z.enum(["baixa", "media", "alta"]),
        impacto: z.enum(["baixo", "medio", "alto"]),
        alocacao: z.enum(["contratante", "contratado"]),
        mitigacao: z.string().optional().or(z.literal("")),
      })).max(200),
    }),
  },
  async (i, { user }) => {
    const contrato = await prisma.contratoLicitacao.findUnique({ where: { licitacaoId: i.licitacaoId }, select: { id: true } });
    if (!contrato) throw new ActionError("Cadastre o contrato antes da matriz de risco.");
    await prisma.$transaction(async (tx) => {
      await tx.matrizRiscoItem.deleteMany({ where: { contratoId: contrato.id } });
      if (i.itens.length > 0) {
        await tx.matrizRiscoItem.createMany({
          data: i.itens.map((it, n) => ({ contratoId: contrato.id, evento: it.evento, probabilidade: it.probabilidade, impacto: it.impacto, alocacao: it.alocacao, mitigacao: it.mitigacao || null, ordem: n })),
        });
      }
      await registrarHistorico(tx, i.licitacaoId, "Matriz de risco atualizada.", user.id);
    });
    rev();
    return { ok: true };
  },
);
