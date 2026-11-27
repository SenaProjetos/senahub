"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { podeVerFinanceiro } from "@/lib/permissions";
import { noEscopoDoProjeto } from "@/modules/planejamento/escopo";
import { completarEquipeNaBase, previaEquipeNaBase } from "@/modules/planejamento/orcamento-base-service";

/**
 * "Completar a equipe na linha de base": quem aprova o cronograma (`cronograma:aprovar`, decisão do dono em 26/11/2026)
 * atualiza horas e custo da linha de base nas atividades que ainda não começaram. Regra em `orcamento-base.ts`.
 */

const cron = { modulo: "planejamento", recurso: "cronograma", permissao: "aprovar" } as const;

/** Só leitura: o que vai mudar. O R$ só sai para quem vê o financeiro (é taxa de remuneração multiplicada). */
export const previaCompletarEquipeNaBase = defineAction(
  {
    ...cron,
    acao: "previa-completar-equipe-na-base",
    audit: false,
    schema: z.object({ projetoId: z.string().min(1) }),
  },
  noEscopoDoProjeto(async (i) => i.projetoId, async (i, ctx) =>
    previaEquipeNaBase(i.projetoId, { verCusto: await podeVerFinanceiro(ctx.user) }),
  ),
);

export const completarEquipeNaBaseAction = defineAction(
  {
    ...cron,
    acao: "completar-equipe-na-base",
    entidade: "EapBaseline",
    schema: z.object({
      projetoId: z.string().min(1),
      motivo: z.string().trim().min(5, "Explique o motivo (quem entrou na equipe).").max(500),
    }),
  },
  noEscopoDoProjeto(async (i) => i.projetoId, async (i, ctx) => {
    const r = await completarEquipeNaBase(i.projetoId, ctx.user.id, i.motivo);
    revalidatePath(`/planejamento/${i.projetoId}`);
    revalidatePath(`/projetos/${i.projetoId}`, "layout");
    return r;
  }),
);
