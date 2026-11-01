import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { calcularRateioDoMes, type LinhaRateio } from "@/modules/rh/rateio/queries";
import { mesTerminou } from "@/modules/rh/rateio/custo-hora/distribuicao";
import { motivoParaNaoFechar, motivoParaNaoReabrir, motivoParaNaoRecalcular, MSG_JA_FECHADO } from "./regras";

/**
 * Fechamento do rateio no banco (R3; decisões 8, 14 e 17 do spec 2026-09-15) — o mesmo código das
 * Server Actions e do smoke. "Fechado" = existe `FechamentoRateio` do mês; reabrir APAGA cabeçalho e
 * linhas e guarda o que havia num `FechamentoRateioEvento`, então nenhum leitor precisa mudar.
 */

type Tx = Prisma.TransactionClient;

const somaCent = (linhas: LinhaRateio[]) => linhas.reduce((s, l) => s + l.custoCent, 0);

async function gravarLinhas(tx: Tx, ano: number, mes: number, linhas: LinhaRateio[]) {
  if (linhas.length === 0) return;
  await tx.rateioHora.createMany({
    data: linhas.map((l) => ({
      userId: l.userId,
      projetoId: l.projetoId,
      natureza: l.natureza,
      disciplinaId: l.disciplinaId,
      contratacao: l.contratacao,
      ano,
      mes,
      minutos: l.minutos,
      custoHora: l.minutos > 0 ? Math.round((l.custoCent * 60) / l.minutos) / 100 : 0,
      custo: l.custoCent / 100,
    })),
  });
}

/** Foto do mês fechado: o que o AuditLog e o evento guardam antes de reabrir/recalcular. */
export async function fechamentoAtual(ano: number, mes: number) {
  const [cabecalho, linhas] = await Promise.all([
    prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { calculo: true, custoTotal: true, fechadoEm: true, fechadoPorId: true } }),
    prisma.rateioHora.count({ where: { ano, mes } }),
  ]);
  return cabecalho ? { ...cabecalho, custoTotal: Number(cabecalho.custoTotal), linhas } : null;
}

const ehUnico = (e: unknown) => (e as { code?: string }).code === "P2002";

export async function fecharMesNoBanco(ano: number, mes: number, autorId: string, agora = new Date()) {
  const ja = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { id: true } });
  const motivo = motivoParaNaoFechar({ mesTerminou: mesTerminou(ano, mes, agora), fechado: !!ja });
  if (motivo) throw new ActionError(motivo);
  const { calculo, linhas } = await calcularRateioDoMes(ano, mes);
  const total = somaCent(linhas);
  try {
    await prisma.$transaction(async (tx) => {
      // `create` (não upsert): o único de (ano, mes) recusa um segundo fechamento simultâneo.
      await tx.fechamentoRateio.create({ data: { ano, mes, calculo, custoTotal: total / 100, fechadoPorId: autorId } });
      await gravarLinhas(tx, ano, mes, linhas);
      await tx.fechamentoRateioEvento.create({ data: { ano, mes, tipo: "fechou", calculo, custoTotal: total / 100, autorId } });
    });
  } catch (e) {
    if (ehUnico(e)) throw new ActionError(MSG_JA_FECHADO);
    throw e;
  }
  return { linhas: linhas.length, calculo, custoTotal: total / 100 };
}

export async function reabrirMesNoBanco(ano: number, mes: number, motivo: string, autorId: string) {
  const atual = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { calculo: true, custoTotal: true } });
  const recusa = motivoParaNaoReabrir({ fechado: !!atual, motivo });
  if (recusa) throw new ActionError(recusa);
  await prisma.$transaction(async (tx) => {
    const r = await tx.fechamentoRateio.deleteMany({ where: { ano, mes } });
    if (r.count !== 1) throw new ActionError("O fechamento deste mês mudou enquanto era reaberto: tente de novo.");
    await tx.rateioHora.deleteMany({ where: { ano, mes } });
    await tx.fechamentoRateioEvento.create({
      data: { ano, mes, tipo: "reabriu", motivo: motivo.trim(), calculo: atual!.calculo, custoTotal: atual!.custoTotal, autorId },
    });
  });
}

export async function recalcularMesNoBanco(ano: number, mes: number, motivo: string, autorId: string) {
  const atual = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { calculo: true, custoTotal: true } });
  const recusa = motivoParaNaoRecalcular({ fechado: !!atual, calculo: atual?.calculo ?? null, motivo });
  if (recusa) throw new ActionError(recusa);
  const { linhas } = await calcularRateioDoMes(ano, mes, { forcarV2: true });
  const total = somaCent(linhas);
  await prisma.$transaction(async (tx) => {
    const r = await tx.fechamentoRateio.deleteMany({ where: { ano, mes, calculo: "legado" } });
    if (r.count !== 1) throw new ActionError("O fechamento deste mês mudou enquanto era recalculado: tente de novo.");
    await tx.rateioHora.deleteMany({ where: { ano, mes } });
    await tx.fechamentoRateioEvento.create({
      data: { ano, mes, tipo: "recalculou", motivo: motivo.trim(), calculo: "legado", custoTotal: atual!.custoTotal, autorId },
    });
    await tx.fechamentoRateio.create({ data: { ano, mes, calculo: "v2", custoTotal: total / 100, fechadoPorId: autorId } });
    await gravarLinhas(tx, ano, mes, linhas);
    await tx.fechamentoRateioEvento.create({ data: { ano, mes, tipo: "fechou", calculo: "v2", custoTotal: total / 100, autorId } });
  });
  return { antes: Number(atual!.custoTotal), depois: total / 100 };
}
