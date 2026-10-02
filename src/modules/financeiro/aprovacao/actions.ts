"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { CHAVE_NIVEIS_APROVACAO, getNiveisAprovacao, valorParaAlcada } from "@/modules/financeiro/aprovacao/queries";
import { motivoParaNaoAprovar } from "@/modules/financeiro/aprovacao/niveis";
import { exigirOperacao } from "@/modules/financeiro/lancamentos/situacao-service";

function rev() {
  revalidatePath("/financeiro/aprovacoes");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
}

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
    capturarAntes: async () => (await prisma.configSistema.findUnique({ where: { chave: CHAVE_NIVEIS_APROVACAO } }))?.valor ?? null,
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


/** Foto do lançamento para a auditoria ver o antes (N6): situação, valor, datas e quem decidiu. */
async function fotoDoLancamento(id: string) {
  const l = await prisma.lancamento.findUnique({
    where: { id },
    select: { status: true, valor: true, valorEfetivo: true, dataConfirmacao: true, contaId: true, aprovadoPorId: true, motivoRejeicao: true },
  });
  return l ? { ...l, valor: Number(l.valor), valorEfetivo: l.valorEfetivo != null ? Number(l.valorEfetivo) : null } : null;
}

const aprovarBase = {
  modulo: "financeiro",
  recurso: "financeiro",
  permissao: "aprovar",
  entidade: "Lancamento",
} as const;

/** Aprova a despesa: libera para previsto (entra no fluxo normal). Requer financeiro:aprovar. */
export const aprovarLancamento = defineAction(
  { ...aprovarBase, acao: "aprovar-lancamento", schema: z.object({ id: z.string().min(1) }), capturarAntes: (i) => fotoDoLancamento(i.id) },
  async (i, ctx) => {
    await exigirOperacao(prisma, i.id, "aprovar");
    const l = await prisma.lancamento.findUniqueOrThrow({
      where: { id: i.id },
      select: { id: true, status: true, autorId: true, descricao: true, valor: true, recorrenciaGrupo: true },
    });
    // Alçada única (N3): total do parcelamento × papel; quem lançou não aprova (só o admin).
    const motivo = motivoParaNaoAprovar({
      valorAlcada: await valorParaAlcada(prisma, l),
      faixas: await getNiveisAprovacao(),
      aprovador: ctx.user,
      autorId: l.autorId,
    });
    if (motivo) throw new ActionError(motivo);
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
      await notificar(l.autorId, { titulo: "Despesa aprovada", corpo: l.descricao, href: "/financeiro/lancamentos" }, { categoria: "despesa" });
    }
    rev();
    return { id: i.id };
  },
);

/** Rejeita a despesa: cancela com motivo. Requer financeiro:aprovar. */
export const rejeitarLancamento = defineAction(
  {
    ...aprovarBase,
    acao: "rejeitar-lancamento",
    schema: z.object({ id: z.string().min(1), motivo: z.string().min(1, "Informe o motivo.") }),
    capturarAntes: (i) => fotoDoLancamento(i.id),
  },
  async (i, ctx) => {
    await exigirOperacao(prisma, i.id, "rejeitar");
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id: i.id }, select: { status: true, autorId: true, descricao: true } });
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
      await notificar(l.autorId, { titulo: "Despesa rejeitada", corpo: `${l.descricao} — ${i.motivo}`, href: "/financeiro/lancamentos" }, { categoria: "despesa" });
    }
    rev();
    return { id: i.id };
  },
);
