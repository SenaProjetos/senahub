"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { CHAVE_LIMITE_APROVACAO, CHAVE_NIVEIS_APROVACAO, getNiveisAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { papeisAprovadores } from "@/modules/financeiro/aprovacao/niveis";

function rev() {
  revalidatePath("/financeiro/aprovacoes");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
}

/** Define o limite de alçada (R$). Requer financeiro:gerir. */
export const salvarLimiteAprovacao = defineAction(
  {
    modulo: "financeiro",
    recurso: "financeiro",
    permissao: "gerir",
    acao: "salvar-limite-aprovacao",
    entidade: "ConfigSistema",
    schema: z.object({ limite: z.number().min(0) }),
  },
  async (i) => {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_LIMITE_APROVACAO },
      create: { chave: CHAVE_LIMITE_APROVACAO, valor: i.limite },
      update: { valor: i.limite },
    });
    rev();
    return { limite: i.limite };
  },
);

const aliquotaNivel = z.object({ ate: z.number().min(0).nullable(), papeis: z.array(z.string()).max(8) });

/** Define os níveis de alçada (faixas de valor → papéis aprovadores). Requer financeiro:gerir. */
export const salvarNiveisAprovacao = defineAction(
  {
    modulo: "financeiro",
    recurso: "financeiro",
    permissao: "gerir",
    acao: "salvar-niveis-aprovacao",
    entidade: "ConfigSistema",
    schema: z.object({ niveis: z.array(aliquotaNivel).min(1).max(10) }),
  },
  async (i) => {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_NIVEIS_APROVACAO },
      create: { chave: CHAVE_NIVEIS_APROVACAO, valor: i.niveis },
      update: { valor: i.niveis },
    });
    rev();
    return { ok: true };
  },
);

const aprovarBase = {
  modulo: "financeiro",
  recurso: "financeiro",
  permissao: "aprovar",
  entidade: "Lancamento",
} as const;

/** Aprova a despesa: libera para previsto (entra no fluxo normal). Requer financeiro:aprovar. */
export const aprovarLancamento = defineAction(
  { ...aprovarBase, acao: "aprovar-lancamento", schema: z.object({ id: z.string().min(1) }) },
  async (i, ctx) => {
    const l = await prisma.lancamento.findUnique({ where: { id: i.id }, select: { status: true, autorId: true, descricao: true, valor: true } });
    if (!l) throw new ActionError("Lançamento não encontrado.");
    if (l.status !== "aguardando_aprovacao") throw new ActionError("Lançamento não está aguardando aprovação.");
    // Alçada por faixa: o papel do aprovador deve cobrir o valor (admin tem bypass).
    const papeis = papeisAprovadores(Number(l.valor), await getNiveisAprovacao());
    if (ctx.user.role !== "admin" && !papeis.includes(ctx.user.role)) {
      throw new ActionError("Você não tem alçada para aprovar este valor.");
    }
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        status: "previsto",
        aprovadoPorId: ctx.user.id,
        aprovadoEm: new Date(),
        motivoRejeicao: null,
        statusHistorico: { create: { de: "aguardando_aprovacao", para: "previsto", autorId: ctx.user.id } },
      },
    });
    if (l.autorId !== ctx.user.id) {
      await notificar(l.autorId, { titulo: "Despesa aprovada", corpo: l.descricao, href: "/financeiro/lancamentos" });
    }
    rev();
    return { id: i.id };
  },
);

/** Rejeita a despesa: cancela com motivo. Requer financeiro:aprovar. */
export const rejeitarLancamento = defineAction(
  { ...aprovarBase, acao: "rejeitar-lancamento", schema: z.object({ id: z.string().min(1), motivo: z.string().min(1, "Informe o motivo.") }) },
  async (i, ctx) => {
    const l = await prisma.lancamento.findUnique({ where: { id: i.id }, select: { status: true, autorId: true, descricao: true } });
    if (!l) throw new ActionError("Lançamento não encontrado.");
    if (l.status !== "aguardando_aprovacao") throw new ActionError("Lançamento não está aguardando aprovação.");
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        status: "cancelado",
        aprovadoPorId: ctx.user.id,
        aprovadoEm: new Date(),
        motivoRejeicao: i.motivo,
        statusHistorico: { create: { de: "aguardando_aprovacao", para: "cancelado", autorId: ctx.user.id } },
      },
    });
    if (l.autorId !== ctx.user.id) {
      await notificar(l.autorId, { titulo: "Despesa rejeitada", corpo: `${l.descricao} — ${i.motivo}`, href: "/financeiro/lancamentos" });
    }
    rev();
    return { id: i.id };
  },
);
