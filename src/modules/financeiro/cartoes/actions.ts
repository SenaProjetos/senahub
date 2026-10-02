"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  cartaoSchema,
  compraSchema,
  editarCompraSchema,
  idCartaoSchema,
  pagarCompraSchema,
  pagarFaturaSchema,
} from "@/modules/financeiro/cartoes/schemas";
import { editarCompraNoBanco, lancarCompraNoBanco, pagarCompraNoBanco, pagarFaturaNoBanco } from "@/modules/financeiro/cartoes/service";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/cartoes");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

const vazioParaNulo = (v: string | null | undefined) => (v ? v : null);

export const salvarCartao = defineAction(
  {
    ...base,
    acao: "salvar-cartao",
    entidade: "CartaoCredito",
    schema: cartaoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id?: string }).id ?? "novo",
    capturarAntes: (i) => (i.id ? prisma.cartaoCredito.findUnique({ where: { id: i.id } }) : Promise.resolve(null)),
  },
  async (i) => {
    if (i.diaVencimento === i.diaFechamento) {
      throw new ActionError("O vencimento é no mês seguinte ao fechamento: use dias diferentes para não confundir.");
    }
    const dados = {
      nome: i.nome,
      ultimosDigitos: vazioParaNulo(i.ultimosDigitos),
      tipo: i.tipo,
      socioId: i.tipo === "pessoal" ? vazioParaNulo(i.socioId) : null,
      limite: i.tipo === "pessoal" ? null : (i.limite ?? null),
      diaFechamento: i.diaFechamento,
      diaVencimento: i.diaVencimento,
      contaPadraoId: vazioParaNulo(i.contaPadraoId),
      ativo: i.ativo,
    };
    if (i.tipo === "pessoal" && dados.socioId) {
      const s = await prisma.socio.count({ where: { id: dados.socioId } });
      if (!s) throw new ActionError("Sócio não encontrado.");
    }
    if (i.id) {
      const r = await prisma.cartaoCredito.updateMany({ where: { id: i.id }, data: dados });
      if (r.count !== 1) throw new ActionError("Cartão não encontrado.");
      rev();
      return { id: i.id };
    }
    const fim = await prisma.cartaoCredito.aggregate({ _max: { ordem: true } });
    const c = await prisma.cartaoCredito.create({ data: { ...dados, ordem: (fim._max.ordem ?? -1) + 1 } });
    rev();
    return { id: c.id };
  },
);

/** Só some um cartão sem nenhuma compra: o gasto que já aconteceu não se apaga junto. */
export const excluirCartao = defineAction(
  {
    ...base,
    acao: "excluir-cartao",
    entidade: "CartaoCredito",
    schema: idCartaoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (i) => prisma.cartaoCredito.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const compras = await prisma.lancamento.count({ where: { cartaoId: i.id } });
    if (compras > 0) {
      throw new ActionError("Este cartão já tem compras: deixe-o inativo para guardar o histórico.");
    }
    await prisma.faturaCartao.deleteMany({ where: { cartaoId: i.id } });
    const r = await prisma.cartaoCredito.deleteMany({ where: { id: i.id } });
    if (r.count !== 1) throw new ActionError("Cartão não encontrado.");
    rev();
    return { id: i.id };
  },
);

/** Lança a compra (uma despesa por parcela, cada uma na fatura do seu ciclo). */
export const lancarCompraNoCartao = defineAction(
  { ...base, acao: "lancar-compra-cartao", entidade: "Lancamento", schema: compraSchema },
  async (i, ctx) => {
    const r = await lancarCompraNoBanco(
      {
        cartaoId: i.cartaoId,
        descricao: i.descricao,
        valor: i.valor,
        dataCompra: i.dataCompra,
        categoriaId: i.categoriaId,
        parcelas: i.parcelas,
        centroId: vazioParaNulo(i.centroId),
        projetoId: vazioParaNulo(i.projetoId),
        fornecedorId: vazioParaNulo(i.fornecedorId),
        observacao: vazioParaNulo(i.observacao),
      },
      ctx.user.id,
    );
    rev();
    return { id: r.lancamentoIds[0] ?? null, parcelas: r.lancamentoIds.length };
  },
);

/** Paga a fatura: realiza todas as compras em aberto dela. Não cria lançamento de pagamento. */
export const pagarFatura = defineAction(
  { ...base, acao: "pagar-fatura-cartao", entidade: "FaturaCartao", schema: pagarFaturaSchema, entidadeId: (d, i) => ((d ?? i) as { faturaId: string }).faturaId },
  async (i, ctx) => {
    const r = await pagarFaturaNoBanco(i, ctx.user.id);
    rev();
    return r;
  },
);

/** Paga uma compra sozinha ("Reembolsar só esta", do cartão pessoal). */
export const pagarCompraDoCartao = defineAction(
  { ...base, acao: "pagar-compra-cartao", entidade: "Lancamento", schema: pagarCompraSchema, entidadeId: (d, i) => ((d ?? i) as { lancamentoId: string }).lancamentoId },
  async (i, ctx) => {
    await pagarCompraNoBanco(i.lancamentoId, i.contaId, i.data, ctx.user.id);
    rev();
    return { id: i.lancamentoId };
  },
);

/** Edita uma compra em aberto (mudar a data pode trocá-la de fatura). */
export const editarCompraDoCartao = defineAction(
  {
    ...base,
    acao: "editar-compra-cartao",
    entidade: "Lancamento",
    schema: editarCompraSchema,
    entidadeId: (d, i) => ((d ?? i) as { lancamentoId: string }).lancamentoId,
    capturarAntes: (i) => prisma.lancamento.findUnique({ where: { id: i.lancamentoId } }),
  },
  async (i, ctx) => {
    const r = await editarCompraNoBanco(
      {
        lancamentoId: i.lancamentoId,
        descricao: i.descricao,
        valor: i.valor,
        dataCompra: i.dataCompra,
        categoriaId: i.categoriaId,
        centroId: vazioParaNulo(i.centroId),
        projetoId: vazioParaNulo(i.projetoId),
        fornecedorId: vazioParaNulo(i.fornecedorId),
        observacao: vazioParaNulo(i.observacao),
      },
      ctx.user.id,
    );
    rev();
    return r;
  },
);
