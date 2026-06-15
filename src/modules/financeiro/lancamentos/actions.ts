"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  criarLancamentoSchema,
  editarLancamentoSchema,
  confirmarLancamentoSchema,
  idLancamentoSchema,
} from "@/modules/financeiro/lancamentos/schemas";
import { devePassarPorAprovacao } from "@/lib/aprovacao";
import { notificarMuitos } from "@/lib/notificar";
import { limiteAprovacao, aprovadores } from "@/modules/financeiro/aprovacao/queries";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/relatorios");
}

function data(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export const criarLancamento = defineAction(
  { ...base, acao: "criar-lancamento", entidade: "Lancamento", schema: criarLancamentoSchema },
  async (i, { user }) => {
    const dataBase = data(i.data);
    if (!dataBase) throw new ActionError("Data inválida.");
    const vencBase = data(i.vencimento || undefined);

    // Alçada (Fase 4): despesa ≥ limite trava em aguardando_aprovacao (ignora "confirmado").
    const limite = await limiteAprovacao();
    const precisaAprovar = devePassarPorAprovacao(i.tipo, i.valor, limite);
    const statusInicial = precisaAprovar
      ? ("aguardando_aprovacao" as const)
      : i.confirmado
        ? ("confirmado" as const)
        : ("previsto" as const);

    const grupo = i.ocorrencias > 1 ? randomUUID() : null;
    const comum = {
      tipo: i.tipo,
      descricao: i.descricao,
      valor: i.valor,
      categoriaId: i.categoriaId,
      centroId: i.centroId || null,
      contaId: i.contaId || null,
      formaId: i.formaId || null,
      projetoId: i.projetoId || null,
      fornecedorId: i.fornecedorId || null,
      clienteId: i.clienteId || null,
      observacao: i.observacao || null,
      recorrenciaGrupo: grupo,
      autorId: user.id,
      status: statusInicial,
    };

    const confirmaAgora = statusInicial === "confirmado";
    const registros = Array.from({ length: i.ocorrencias }, (_, n) => ({
      ...comum,
      data: addMonths(dataBase, n),
      vencimento: vencBase ? addMonths(vencBase, n) : null,
      dataConfirmacao: confirmaAgora ? addMonths(dataBase, n) : null,
    }));

    await prisma.lancamento.createMany({ data: registros });
    if (precisaAprovar) {
      const ids = await aprovadores();
      await notificarMuitos(ids.filter((id) => id !== user.id), {
        titulo: "Despesa aguardando aprovação",
        corpo: `${i.descricao} — ${i.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        href: "/financeiro/aprovacoes",
      });
    }
    rev();
    return { ocorrencias: registros.length, aguardandoAprovacao: precisaAprovar };
  },
);

export const editarLancamento = defineAction(
  { ...base, acao: "editar-lancamento", entidade: "Lancamento", schema: editarLancamentoSchema },
  async (i) => {
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        descricao: i.descricao,
        valor: i.valor,
        data: data(i.data),
        vencimento: data(i.vencimento || undefined) ?? null,
        categoriaId: i.categoriaId,
        centroId: i.centroId || null,
        projetoId: i.projetoId || null,
        fornecedorId: i.fornecedorId || null,
        clienteId: i.clienteId || null,
        observacao: i.observacao || null,
      },
    });
    rev();
    return { id: i.id };
  },
);

/** Confirma (realiza) um lançamento previsto → entra no caixa/DRE. */
export const confirmarLancamento = defineAction(
  { ...base, acao: "confirmar-lancamento", entidade: "Lancamento", schema: confirmarLancamentoSchema },
  async (i) => {
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.status === "confirmado") throw new ActionError("Já confirmado.");
    if (lanc.status === "aguardando_aprovacao") throw new ActionError("Despesa aguardando aprovação.");

    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        status: "confirmado",
        dataConfirmacao: data(i.dataConfirmacao || undefined) ?? new Date(),
        contaId: i.contaId || lanc.contaId,
        formaId: i.formaId || lanc.formaId,
        valorEfetivo: i.valorEfetivo ?? null,
      },
    });
    rev();
    return { id: i.id };
  },
);

export const cancelarLancamento = defineAction(
  { ...base, acao: "cancelar-lancamento", entidade: "Lancamento", schema: idLancamentoSchema },
  async (i) => {
    await prisma.lancamento.update({ where: { id: i.id }, data: { status: "cancelado" } });
    rev();
    return { id: i.id };
  },
);

export const excluirLancamento = defineAction(
  { ...base, acao: "excluir-lancamento", entidade: "Lancamento", schema: idLancamentoSchema },
  async (i) => {
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.pagamentoProjetistaId) {
      throw new ActionError("Lançamento de folha não pode ser excluído aqui.");
    }
    await prisma.lancamento.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
