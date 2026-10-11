"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";

import { fechamentoAtual, fecharMesNoBanco, reabrirMesNoBanco, recalcularMesNoBanco } from "@/modules/rh/rateio/fechamento/service";

const mesSchema = z.object({
  ano: z.number({ error: "Ano inválido." }).int("Ano inválido.").min(2000, "Ano inválido.").max(2100, "Ano inválido."),
  mes: z.number({ error: "Mês inválido." }).int("Mês inválido.").min(1, "Mês inválido.").max(12, "Mês inválido."),
});
const comMotivo = mesSchema.extend({ motivo: z.string().max(500, "Motivo com até 500 caracteres.") });

const base = {
  modulo: "rh",
  gereRh: true,
  entidade: "FechamentoRateio",
  entidadeId: (_d: unknown, i: { ano: number; mes: number }) => `${i.ano}-${String(i.mes).padStart(2, "0")}`,
  capturarAntes: async (i: { ano: number; mes: number }) => fechamentoAtual(i.ano, i.mes),
} as const;

function revalidar() {
  revalidatePath("/ponto");
  revalidatePath("/rh/rateio");
}

/**
 * Fecha o rateio do mês (R3): só mês terminado e ainda não fechado — mudar um mês fechado é reabrir
 * com motivo. Grava o cabeçalho com o custo total, as linhas e o evento "fechou".
 */
export const fecharRateioMes = defineAction(
  { ...base, acao: "fechar-rateio", schema: mesSchema },
  async ({ ano, mes }, { user }) => {
    // Os reais ficam no servidor (decisão 26): quem gere o RH pode não ver custo.
    const r = await fecharMesNoBanco(ano, mes, user.id);
    revalidar();
    return { linhas: r.linhas, calculo: r.calculo };
  },
);

/** Reabre um mês fechado com motivo (decisão 17): apaga o fechamento e guarda o que havia no histórico. */
export const reabrirRateioMes = defineAction(
  { ...base, acao: "reabrir-rateio", schema: comMotivo },
  async ({ ano, mes, motivo }, { user }) => {
    await reabrirMesNoBanco(ano, mes, motivo, user.id);
    revalidar();
    return { ok: true };
  },
);

/** Refaz um mês fechado no cálculo antigo com o cálculo novo, com motivo e registro (decisão 8). */
export const recalcularRateioMes = defineAction(
  { ...base, acao: "recalcular-rateio", schema: comMotivo },
  async ({ ano, mes, motivo }, { user }) => {
    await recalcularMesNoBanco(ano, mes, motivo, user.id);
    revalidar();
    return { ok: true };
  },
);
