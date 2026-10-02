"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  aporteSchema,
  arquivarSchema,
  editarAtivoSchema,
  excluirMovimentoSchema,
  idAtivoSchema,
  novoAtivoSchema,
  rendimentoSchema,
  resgateSchema,
} from "@/modules/financeiro/investimentos/schemas";
import {
  aportarNoBanco,
  arquivarNoBanco,
  criarInvestimentoNoBanco,
  editarInvestimentoNoBanco,
  excluirInvestimentoNoBanco,
  excluirMovimentoNoBanco,
  registrarRendimentoNoBanco,
  resgatarNoBanco,
} from "@/modules/financeiro/investimentos/service";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  for (const p of ["/financeiro/investimentos", "/financeiro", "/financeiro/balanco", "/financeiro/planejador", "/financeiro/lancamentos", "/financeiro/relatorios"]) {
    revalidatePath(p);
  }
}

const antesDoAtivo = (id: string) => prisma.investimento.findUnique({ where: { id } });
const idDe = (d: unknown, i: unknown) => ((d ?? i) as { id?: string; investimentoId?: string }).id ?? ((d ?? i) as { investimentoId?: string }).investimentoId ?? "novo";

export const criarInvestimento = defineAction(
  { ...base, acao: "criar-investimento", entidade: "Investimento", schema: novoAtivoSchema, entidadeId: idDe },
  async (i, ctx) => {
    const r = await criarInvestimentoNoBanco({ ...i, vencimento: i.vencimento || null, aporte: i.aporte ?? null }, ctx.user.id);
    rev();
    return { id: r.id };
  },
);

export const editarInvestimento = defineAction(
  { ...base, acao: "editar-investimento", entidade: "Investimento", schema: editarAtivoSchema, entidadeId: idDe, capturarAntes: (i) => antesDoAtivo(i.id) },
  async (i) => {
    const { id, ...dados } = i;
    await editarInvestimentoNoBanco(id, { ...dados, vencimento: dados.vencimento || null });
    rev();
    return { id };
  },
);

export const aportarInvestimento = defineAction(
  { ...base, acao: "aportar-investimento", entidade: "Investimento", schema: aporteSchema, entidadeId: idDe },
  async (i, ctx) => {
    await aportarNoBanco(i, ctx.user.id);
    rev();
    return { id: i.investimentoId };
  },
);

export const registrarRendimento = defineAction(
  { ...base, acao: "registrar-rendimento", entidade: "Investimento", schema: rendimentoSchema, entidadeId: idDe },
  async (i, ctx) => {
    const r = await registrarRendimentoNoBanco(i, ctx.user.id);
    rev();
    return r;
  },
);

export const resgatarInvestimento = defineAction(
  { ...base, acao: "resgatar-investimento", entidade: "Investimento", schema: resgateSchema, entidadeId: idDe, capturarAntes: (i) => antesDoAtivo(i.investimentoId) },
  async (i, ctx) => {
    const r = await resgatarNoBanco(i, ctx.user.id);
    rev();
    return r;
  },
);

export const excluirMovimentoInvestimento = defineAction(
  {
    ...base,
    acao: "excluir-movimento-investimento",
    entidade: "Lancamento",
    schema: excluirMovimentoSchema,
    entidadeId: (d, i) => ((d ?? i) as { lancamentoId: string }).lancamentoId,
    capturarAntes: (i) => prisma.lancamento.findUnique({ where: { id: i.lancamentoId } }),
  },
  async (i, ctx) => {
    await excluirMovimentoNoBanco(i, ctx.user.id);
    rev();
    return { id: i.lancamentoId };
  },
);

export const arquivarInvestimento = defineAction(
  { ...base, acao: "arquivar-investimento", entidade: "Investimento", schema: arquivarSchema, entidadeId: idDe, capturarAntes: (i) => antesDoAtivo(i.id) },
  async (i) => {
    await arquivarNoBanco(i.id, i.arquivar);
    rev();
    return { id: i.id };
  },
);

export const excluirInvestimento = defineAction(
  { ...base, acao: "excluir-investimento", entidade: "Investimento", schema: idAtivoSchema, entidadeId: idDe, capturarAntes: (i) => antesDoAtivo(i.id) },
  async (i) => {
    await excluirInvestimentoNoBanco(i.id);
    rev();
    return { id: i.id };
  },
);
