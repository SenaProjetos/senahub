"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Role, EscopoDeDados } from "@/lib/roles";
import { escopoCustoOrcamento } from "../queries";
import * as service from "./service";
import { previewTrocaBase } from "./service";
import {
  criarItemSchema,
  editarItemSchema,
  moverItemSchema,
  idItemSchema,
  alternarTravaSchema,
  vincularComposicaoSchema,
  vincularInsumoSchema,
  definirBasePrecoSchema,
  trocarBaseSchema,
  duplicarOrcamentoSchema,
} from "./schemas";

const base = { modulo: "custos", recurso: "custos", permissao: "gerir" } as const;
const leitura = { modulo: "custos", recurso: "custos", permissao: "ver", audit: false } as const;

const rev = (orcamentoId: string) => {
  revalidatePath("/custos");
  revalidatePath(`/custos/${orcamentoId}`);
};

type Viewer = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

/** Escopo de acesso (D1) pelo id do ORÇAMENTO. */
async function exigirOrcamentoNoEscopo(orcamentoId: string, viewer: Viewer) {
  const r = await prisma.custoOrcamento.findFirst({
    where: { AND: [{ id: orcamentoId }, escopoCustoOrcamento(viewer)] },
    select: { id: true },
  });
  if (!r) throw new ActionError("Orçamento não encontrado.");
}

/** Escopo de acesso pelo id do ITEM — resolve o orçamento dono antes de checar. */
async function exigirItemNoEscopo(itemId: string, viewer: Viewer): Promise<string> {
  const item = await prisma.custoOrcamentoItem.findUnique({
    where: { id: itemId },
    select: { orcamentoId: true },
  });
  if (!item) throw new ActionError("Item não encontrado.");
  await exigirOrcamentoNoEscopo(item.orcamentoId, viewer);
  return item.orcamentoId;
}

// ── Itens da árvore ──────────────────────────────────────────────

export const criarItem = defineAction(
  {
    ...base,
    acao: "criar-item-orcamento",
    entidade: "CustoOrcamentoItem",
    schema: criarItemSchema,
    entidadeId: (data) => (data as { item: { id: string } }).item.id,
  },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    const r = await service.criarItem({
      orcamentoId: input.orcamentoId,
      parentId: input.parentId ?? null,
      tipo: input.tipo,
      descricao: input.descricao,
      unidade: input.unidade || null,
      quantidade: input.quantidade,
      composicaoId: input.composicaoId,
      insumoId: input.insumoId,
    });
    rev(input.orcamentoId);
    return r;
  },
);

export const editarItem = defineAction(
  {
    ...base,
    acao: "editar-item-orcamento",
    entidade: "CustoOrcamentoItem",
    schema: editarItemSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamentoItem.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.id, user);
    const item = await service.editarItem(input);
    rev(orcamentoId);
    return item;
  },
);

export const moverItem = defineAction(
  {
    ...base,
    acao: "mover-item-orcamento",
    entidade: "CustoOrcamentoItem",
    schema: moverItemSchema,
    entidadeId: (_data, input) => input.id,
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.id, user);
    const item = await service.moverItem(input);
    rev(orcamentoId);
    return item;
  },
);

export const excluirItem = defineAction(
  {
    ...base,
    acao: "excluir-item-orcamento",
    entidade: "CustoOrcamentoItem",
    schema: idItemSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamentoItem.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.id, user);
    const item = await service.excluirItem(input.id);
    rev(orcamentoId);
    return item;
  },
);

export const alternarTrava = defineAction(
  {
    ...base,
    acao: "alternar-trava-item",
    entidade: "CustoOrcamentoItem",
    schema: alternarTravaSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) =>
      prisma.custoOrcamentoItem.findUnique({ where: { id: input.id }, select: { bloqueado: true } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.id, user);
    const item = await service.alternarTrava(input.id, input.bloqueado);
    rev(orcamentoId);
    return item;
  },
);

export const vincularComposicao = defineAction(
  {
    ...base,
    acao: "vincular-composicao-item",
    entidade: "CustoOrcamentoItem",
    schema: vincularComposicaoSchema,
    entidadeId: (_data, input) => input.itemId,
    capturarAntes: (input) => prisma.custoOrcamentoItem.findUnique({ where: { id: input.itemId } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.itemId, user);
    const r = await service.vincularComposicao(input);
    rev(orcamentoId);
    return r;
  },
);

export const vincularInsumo = defineAction(
  {
    ...base,
    acao: "vincular-insumo-item",
    entidade: "CustoOrcamentoItem",
    schema: vincularInsumoSchema,
    entidadeId: (_data, input) => input.itemId,
    capturarAntes: (input) => prisma.custoOrcamentoItem.findUnique({ where: { id: input.itemId } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.itemId, user);
    const r = await service.vincularInsumo(input);
    rev(orcamentoId);
    return r;
  },
);

// ── Base de preço / troca de data-base ───────────────────────────

export const definirBasePreco = defineAction(
  {
    ...base,
    acao: "definir-base-preco",
    entidade: "CustoOrcamento",
    schema: definirBasePrecoSchema,
    entidadeId: (_data, input) => input.orcamentoId,
    capturarAntes: (input) =>
      prisma.custoOrcamento.findUnique({ where: { id: input.orcamentoId }, select: { basePrecoId: true, dataBase: true } }),
  },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    const base = await prisma.custoBasePreco.findUnique({
      where: { id: input.basePrecoId },
      select: { id: true, dataBase: true },
    });
    if (!base) throw new ActionError("Base de preço não encontrada.");
    const orc = await prisma.custoOrcamento.update({
      where: { id: input.orcamentoId },
      data: { basePrecoId: base.id, dataBase: base.dataBase },
    });
    rev(input.orcamentoId);
    return orc;
  },
);

/** Pré-visualização do impacto — leitura, não grava nada. */
export const previewTrocaDataBase = defineAction(
  { ...leitura, acao: "preview-troca-data-base", schema: trocarBaseSchema },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    return previewTrocaBase(input.orcamentoId, input.basePrecoNovaId);
  },
);

export const aplicarTrocaDataBase = defineAction(
  {
    ...base,
    acao: "trocar-data-base",
    entidade: "CustoOrcamento",
    schema: trocarBaseSchema,
    entidadeId: (_data, input) => input.orcamentoId,
    capturarAntes: (input) =>
      prisma.custoOrcamento.findUnique({ where: { id: input.orcamentoId }, select: { basePrecoId: true, dataBase: true } }),
  },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    const relatorio = await service.aplicarTrocaBase(input.orcamentoId, input.basePrecoNovaId);
    rev(input.orcamentoId);
    return relatorio;
  },
);

// ── Duplicação ───────────────────────────────────────────────────

export const duplicarOrcamento = defineAction(
  {
    ...base,
    acao: "duplicar-orcamento",
    entidade: "CustoOrcamento",
    schema: duplicarOrcamentoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    const novo = await service.duplicarOrcamento(input.orcamentoId, input.titulo, user.id);
    revalidatePath("/custos");
    return novo;
  },
);

// ── Busca de composição/insumo pro diálogo de criação/vínculo ────

export const buscarComposicoesParaVinculo = defineAction(
  { ...leitura, acao: "buscar-composicoes-vinculo", schema: z.object({ q: z.string().optional() }) },
  async (input) => {
    const q = input.q?.trim();
    const registros = await prisma.custoComposicao.findMany({
      where: q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" } },
              { descricao: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { codigo: "asc" },
      take: 20,
      select: { id: true, codigo: true, descricao: true, unidade: true, base: { select: { nome: true, fonte: true } } },
    });
    return registros.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      descricao: r.descricao,
      unidade: r.unidade,
      basePrecoNome: `${r.base.nome} (${r.base.fonte})`,
    }));
  },
);

export const buscarInsumosParaVinculo = defineAction(
  { ...leitura, acao: "buscar-insumos-vinculo", schema: z.object({ q: z.string().optional() }) },
  async (input) => {
    const q = input.q?.trim();
    return prisma.custoInsumo.findMany({
      where: q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" } },
              { descricao: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { codigo: "asc" },
      take: 20,
      select: { id: true, codigo: true, descricao: true, unidade: true, categoria: true },
    });
  },
);
