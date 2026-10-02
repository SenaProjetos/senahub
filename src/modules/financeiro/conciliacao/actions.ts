"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { conciliarNoBanco, criarDaTransacaoNoBanco, desconciliarNoBanco } from "@/modules/financeiro/conciliacao/service";

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

/**
 * Concilia a transação com um lançamento em aberto (que fica pago na data e na conta do extrato) ou já
 * pago sem transação (G1c). Regras na máquina de situações e em `conciliacao/service.ts` (N4).
 */
export const conciliarComLancamento = defineAction(
  { ...base, acao: "conciliar-transacao", entidade: "TransacaoBancaria", schema: conciliarSchema },
  async (i, ctx) => {
    await conciliarNoBanco(i.transacaoId, i.lancamentoId, ctx.user.id);
    rev();
    return { id: i.transacaoId };
  },
);

/** Cria um novo lançamento confirmado a partir da transação e concilia. */
export const criarLancamentoDaTransacao = defineAction(
  { ...base, acao: "criar-lancamento-transacao", entidade: "Lancamento", schema: criarSchema },
  async (i, { user }) => {
    await criarDaTransacaoNoBanco(i.transacaoId, i.categoriaId, user.id);
    rev();
    return { id: i.transacaoId };
  },
);

const desconciliarSchema = z.object({ transacaoId: z.string().min(1) });

/**
 * Desfaz uma conciliação (G1c/D31, N4). A transação volta para a fila e o lançamento volta ao que era
 * ANTES dela: o que a conciliação pagou fica em aberto de novo, o que ela criou sai, o que já estava
 * pago (produção paga pela tela de Produção e depois conciliada) continua pago. Conciliação antiga
 * (sem a foto de antes), lançamento mexido depois ou receita distribuída só desligam, como antes.
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
        select: { conciliado: true, lancamentoId: true, valor: true, data: true, descricao: true, estadoAnterior: true },
      }),
  },
  async (i, ctx) => {
    const r = await desconciliarNoBanco(i.transacaoId, ctx.user.id);
    rev();
    return { id: i.transacaoId, ...r };
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
