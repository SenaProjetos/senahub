"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { fecharBancoDoMes, recalcularHistoricoBanco } from "@/modules/rh/banco/service";

/**
 * Fecha o banco de horas do mês para quem tem jornada controlada (vínculo CLT/
 * estágio vigente no mês): congela o saldo do mês e o acumulado (carry-forward).
 * Idempotente (upsert). Regra em `service.ts`, compartilhada com o job mensal.
 */
export const fecharBancoMesEquipe = defineAction(
  {
    modulo: "rh",
    acao: "fechar-banco-horas",
    roles: HR_ADMIN_ROLES,
    entidade: "BancoHorasMensal",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }) => {
    const fechados = await fecharBancoDoMes(ano, mes);
    revalidatePath("/rh/admin");
    return { fechados };
  },
);

/**
 * Recalcula os meses já fechados a partir de `ano`/`mes`, do mais antigo para o
 * mais recente (no máximo `MAX_MESES_RECALCULO` por chamada).
 *
 * Existe porque `BancoHorasMensal` guarda um SNAPSHOT: corrigir o cálculo não
 * conserta sozinho o que já foi gravado. É recálculo (upsert idempotente sobre
 * o espelho), nunca escrita manual de valor.
 */
export const recalcularBancoHistorico = defineAction(
  {
    modulo: "rh",
    acao: "recalcular-banco-horas",
    roles: HR_ADMIN_ROLES,
    entidade: "BancoHorasMensal",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }) => {
    const r = await recalcularHistoricoBanco(ano, mes);
    revalidatePath("/rh/admin");
    return r;
  },
);
