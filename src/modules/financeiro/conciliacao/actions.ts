"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

// Recorte fino da F4 (2026-09-02): era `permissao: "gerir"`, o mesmo interruptor de lançar
// boleto. Semeado para quem tinha `gerir`, então ninguém perdeu nada — passa a poder ser
// separado pela tela. Ver docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "conciliar" } as const;
const rev = () => {
  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/fluxo-caixa");
  // G1c: conciliar/desconciliar muda o que a tela de Produção mostra e deixa (ou não)
  // corrigir uma linha paga.
  revalidatePath("/financeiro/folha-projetistas");
};

const conciliarSchema = z.object({ transacaoId: z.string().min(1), lancamentoId: z.string().min(1) });
const criarSchema = z.object({ transacaoId: z.string().min(1), categoriaId: z.string().min(1) });
const ignorarSchema = z.object({ transacaoId: z.string().min(1) });

/** Concilia a transação com um lançamento previsto existente → confirma-o. */
export const conciliarComLancamento = defineAction(
  { ...base, acao: "conciliar-transacao", entidade: "TransacaoBancaria", schema: conciliarSchema },
  async (i) => {
    const t = await prisma.transacaoBancaria.findUnique({ where: { id: i.transacaoId } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");

    await prisma.$transaction(async (tx) => {
      // G1c: o alvo agora pode ser um lançamento JÁ confirmado (reconciliar um pagamento de
      // produção depois de desfazer uma conciliação errada). O que continua proibido é
      // roubar o vínculo de outra transação, ou ressuscitar cancelado/excluído.
      const alvo = await tx.lancamento.findFirst({
        // `previsao` (F7.2) é projeção do cronograma, não cobrança: não casa com extrato.
        where: { id: i.lancamentoId, excluidoEm: null, status: { notIn: ["cancelado", "previsao"] }, transacao: { is: null } },
        select: { id: true, pagamentoProjetistaId: true },
      });
      if (!alvo) {
        throw new ActionError("Lançamento indisponível — cancelado, excluído ou já conciliado com outra transação.");
      }

      await tx.lancamento.update({
        where: { id: alvo.id },
        data: { status: "confirmado", dataConfirmacao: t.data, contaId: t.contaId },
      });
      await tx.transacaoBancaria.update({
        where: { id: t.id },
        data: { conciliado: true, lancamentoId: alvo.id },
      });
      // Produção: `pagoEm` acompanha a data do extrato — senão a folha diria uma data e o
      // caixa outra (mesma regra da G1a, onde o extrato manda).
      if (alvo.pagamentoProjetistaId) {
        await tx.pagamentoProjetista.updateMany({
          where: { id: alvo.pagamentoProjetistaId, status: "pago" },
          data: { pagoEm: t.data },
        });
      }
    });
    rev();
    return { id: t.id };
  },
);

/** Cria um novo lançamento confirmado a partir da transação e concilia. */
export const criarLancamentoDaTransacao = defineAction(
  { ...base, acao: "criar-lancamento-transacao", entidade: "Lancamento", schema: criarSchema },
  async (i, { user }) => {
    const t = await prisma.transacaoBancaria.findUnique({ where: { id: i.transacaoId } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");

    const valor = Math.abs(Number(t.valor));
    const tipo = Number(t.valor) > 0 ? "receita" : "despesa";

    await prisma.$transaction(async (tx) => {
      const lanc = await tx.lancamento.create({
        data: {
          tipo,
          descricao: t.descricao,
          valor,
          status: "confirmado",
          data: t.data,
          dataConfirmacao: t.data,
          categoriaId: i.categoriaId,
          contaId: t.contaId,
          autorId: user.id,
        },
      });
      await tx.transacaoBancaria.update({
        where: { id: t.id },
        data: { conciliado: true, lancamentoId: lanc.id },
      });
    });
    rev();
    return { id: t.id };
  },
);

const desconciliarSchema = z.object({ transacaoId: z.string().min(1) });

/**
 * Desfaz uma conciliação (G1c/D31). A transação volta para a fila e o vínculo com o
 * lançamento cai.
 *
 * O STATUS do lançamento NÃO muda de propósito: desconciliar é dizer "essa transação do
 * banco não é esta despesa", não "esta despesa não aconteceu". Um pagamento de produção
 * continua pago — desfazer o pagamento é o estorno (G1b), que é outra ação, com outra
 * justificativa e outro gate.
 *
 * Só existe junto com a mudança em `transacoesPendentes` (sugerir também lançamentos já
 * confirmados): sem ela, a transação solta não teria como voltar ao mesmo lançamento e a
 * única saída na tela seria criar outro, duplicando a despesa no caixa.
 */
export const desconciliarTransacao = defineAction(
  {
    ...base,
    acao: "desconciliar-transacao",
    entidade: "TransacaoBancaria",
    schema: desconciliarSchema,
    capturarAntes: (i) =>
      prisma.transacaoBancaria.findUnique({
        where: { id: i.transacaoId },
        select: { conciliado: true, lancamentoId: true, valor: true, data: true, descricao: true },
      }),
  },
  async (i) => {
    const t = await prisma.transacaoBancaria.findUnique({
      where: { id: i.transacaoId },
      select: { id: true, conciliado: true, lancamentoId: true },
    });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (!t.conciliado && !t.lancamentoId) throw new ActionError("Esta transação não está conciliada.");

    await prisma.transacaoBancaria.update({
      where: { id: t.id },
      data: { conciliado: false, lancamentoId: null },
    });
    rev();
    return { id: t.id, lancamentoId: t.lancamentoId };
  },
);

/** Marca a transação como conciliada sem gerar lançamento (ignorar). */
export const ignorarTransacao = defineAction(
  { ...base, acao: "ignorar-transacao", entidade: "TransacaoBancaria", schema: ignorarSchema },
  async (i) => {
    await prisma.transacaoBancaria.update({
      where: { id: i.transacaoId },
      data: { conciliado: true },
    });
    rev();
    return { id: i.transacaoId };
  },
);
