"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { consolidarMes, saldosDasContasNoFimDoMes } from "@/modules/financeiro/fechamento/queries";
import { getAliquotas } from "@/modules/financeiro/config/queries";
import { calcularFechamento } from "@/modules/financeiro/fechamento/calculo";

// Recorte fino da F4 (2026-09-02): era `permissao: "gerir"`, o mesmo interruptor de lançar
// boleto. Semeado para quem tinha `gerir`, então ninguém perdeu nada — passa a poder ser
// separado pela tela. Ver docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "fechar" } as const;

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
    const f = await prisma.fechamentoMensal.findUnique({ where: { id: i.id }, select: { status: true, ano: true, mes: true } });
    if (!f) throw new ActionError("Fechamento não encontrado.");
    if (f.status === "fechado") throw new ActionError("Mês já fechado.");
    // N5: o que fica congelado é o mês como está AGORA — a prévia gerada antes pode ter ficado velha —
    // e o saldo de cada conta no último dia, para conferir com o extrato do banco.
    const [entrada, aliquotas, saldosContas] = await Promise.all([consolidarMes(f.ano, f.mes), getAliquotas(), saldosDasContasNoFimDoMes(f.ano, f.mes)]);
    const calc = calcularFechamento(entrada, aliquotas);
    const r = await prisma.fechamentoMensal.updateMany({
      where: { id: i.id, status: "aberto" },
      data: {
        status: "fechado",
        fechadoEm: new Date(),
        receitaConfirmada: entrada.receitaConfirmada,
        despesaConfirmada: entrada.despesaConfirmada,
        folhaBruta: entrada.folhaBruta,
        retencaoIss: calc.retencaoIss,
        retencaoInss: calc.retencaoInss,
        retencaoIr: calc.retencaoIr,
        descontos: calc.descontos,
        aliquotas,
        saldosContas,
      },
    });
    if (r.count !== 1) throw new ActionError("Mês já fechado.");
    rev();
    return { id: i.id };
  },
);

export const reabrirFechamento = defineAction(
  { ...base, acao: "reabrir-fechamento", entidade: "FechamentoMensal", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    // N5: reabrir destrava os lançamentos do mês; o saldo congelado sai (vale o do próximo fechamento).
    await prisma.fechamentoMensal.update({ where: { id: i.id }, data: { status: "aberto", fechadoEm: null, saldosContas: Prisma.DbNull } });
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
