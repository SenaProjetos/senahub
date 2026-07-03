"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { consolidarMes } from "@/modules/financeiro/fechamento/queries";
import { getAliquotas } from "@/modules/financeiro/config/queries";
import { calcularFechamento } from "@/modules/financeiro/fechamento/calculo";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/fechamento");
  revalidatePath("/financeiro");
}

/**
 * Gera (ou regera) o fechamento do mês: consolida receita/despesa/folha e aplica as
 * alíquotas atuais. Só gera se não houver fechamento já FECHADO no período.
 */
export const gerarFechamento = defineAction(
  {
    ...base,
    acao: "gerar-fechamento",
    entidade: "FechamentoMensal",
    schema: z.object({ ano: z.number().int().min(2000).max(2100), mes: z.number().int().min(1).max(12) }),
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const existente = await prisma.fechamentoMensal.findUnique({ where: { ano_mes: { ano: i.ano, mes: i.mes } }, select: { id: true, status: true } });
    if (existente?.status === "fechado") throw new ActionError("Mês já fechado. Reabra antes de regerar.");

    const [entrada, aliquotas] = await Promise.all([consolidarMes(i.ano, i.mes), getAliquotas()]);
    const calc = calcularFechamento(entrada, aliquotas);
    const dados = {
      receitaConfirmada: entrada.receitaConfirmada,
      despesaConfirmada: entrada.despesaConfirmada,
      folhaBruta: entrada.folhaBruta,
      retencaoIss: calc.retencaoIss,
      retencaoInss: calc.retencaoInss,
      retencaoIr: calc.retencaoIr,
      descontos: calc.descontos,
      aliquotas,
      responsavelId: user.id,
    };
    const f = await prisma.fechamentoMensal.upsert({
      where: { ano_mes: { ano: i.ano, mes: i.mes } },
      create: { ano: i.ano, mes: i.mes, status: "aberto", ...dados },
      update: { status: "aberto", ...dados },
    });
    rev();
    return { id: f.id };
  },
);

export const fecharMes = defineAction(
  { ...base, acao: "fechar-mes", entidade: "FechamentoMensal", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const f = await prisma.fechamentoMensal.findUnique({ where: { id: i.id }, select: { status: true } });
    if (!f) throw new ActionError("Fechamento não encontrado.");
    if (f.status === "fechado") throw new ActionError("Mês já fechado.");
    await prisma.fechamentoMensal.update({ where: { id: i.id }, data: { status: "fechado", fechadoEm: new Date() } });
    rev();
    return { id: i.id };
  },
);

export const reabrirFechamento = defineAction(
  { ...base, acao: "reabrir-fechamento", entidade: "FechamentoMensal", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.fechamentoMensal.update({ where: { id: i.id }, data: { status: "aberto", fechadoEm: null } });
    rev();
    return { id: i.id };
  },
);

export const excluirFechamento = defineAction(
  { ...base, acao: "excluir-fechamento", entidade: "FechamentoMensal", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const f = await prisma.fechamentoMensal.findUnique({ where: { id: i.id }, select: { status: true } });
    if (!f) throw new ActionError("Fechamento não encontrado.");
    if (f.status === "fechado") throw new ActionError("Reabra o mês antes de excluir.");
    await prisma.fechamentoMensal.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
