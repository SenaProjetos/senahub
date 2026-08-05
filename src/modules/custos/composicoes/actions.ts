"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { z } from "zod";
import {
  enfileirarImportacaoCusto,
  criarComposicaoPropria,
  criarInsumoProprio,
  adicionarItemComposicao,
  removerItemComposicao,
  excluirComposicaoPropria,
} from "./service";
import { obterImportacao, obterComposicao, listarInsumos, listarComposicoes } from "./queries";
import {
  iniciarImportacaoSchema,
  criarComposicaoPropriaSchema,
  criarInsumoSchema,
  adicionarItemComposicaoSchema,
  removerItemComposicaoSchema,
  excluirComposicaoPropriaSchema,
} from "./schemas";
import type { RegimeSinapi, UfSinapi } from "./importador-sinapi";

const base = { modulo: "custos", recurso: "custos", permissao: "bancos" } as const;
const leitura = { modulo: "custos", recurso: "custos", permissao: "ver", audit: false } as const;
const revBancos = () => revalidatePath("/custos/bancos");

/** Status da importação (polling do dialog) — leitura, não é ação de "bancos". */
export const obterImportacaoStatus = defineAction(
  { ...leitura, acao: "obter-importacao-status", schema: z.object({ id: z.string().min(1) }) },
  async (input) => obterImportacao(input.id),
);

/** Recalcula o custo unitário da composição para uma base de preço escolhida na tela. */
export const obterComposicaoDetalhe = defineAction(
  {
    ...leitura,
    acao: "obter-composicao-detalhe",
    schema: z.object({ id: z.string().min(1), basePrecoId: z.string().optional() }),
  },
  async (input) => obterComposicao(input.id, input.basePrecoId),
);

/** Busca de insumo para o seletor de "adicionar item" (composição própria). */
export const buscarInsumosParaItem = defineAction(
  { ...leitura, acao: "buscar-insumos-item", schema: z.object({ q: z.string().optional() }) },
  async (input) => {
    const r = await listarInsumos({ q: input.q });
    return r.itens;
  },
);

/** Busca de composição para o seletor de "adicionar item auxiliar" (composição própria). */
export const buscarComposicoesParaItem = defineAction(
  { ...leitura, acao: "buscar-composicoes-item", schema: z.object({ q: z.string().optional() }) },
  async (input) => {
    const r = await listarComposicoes({ q: input.q });
    return r.itens;
  },
);

export const iniciarImportacaoBase = defineAction(
  {
    ...base,
    acao: "iniciar-importacao-base",
    entidade: "CustoImportacao",
    schema: iniciarImportacaoSchema,
    entidadeId: (data) => (data as { importacaoId?: string }).importacaoId,
  },
  async (input, { user }) => {
    const resultado = await enfileirarImportacaoCusto(
      {
        caminhoArquivo: input.caminhoArquivo,
        dataBase: new Date(input.dataBase),
        ufs: input.ufs as UfSinapi[],
        regimes: input.regimes as RegimeSinapi[],
      },
      user.id,
    );
    revBancos();
    return resultado;
  },
);

export const criarComposicao = defineAction(
  {
    ...base,
    acao: "criar-composicao-propria",
    entidade: "CustoComposicao",
    schema: criarComposicaoPropriaSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input) => {
    const r = await criarComposicaoPropria(input);
    revBancos();
    return r;
  },
);

export const criarInsumo = defineAction(
  {
    ...base,
    acao: "criar-insumo-proprio",
    entidade: "CustoInsumo",
    schema: criarInsumoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input) => {
    const r = await criarInsumoProprio(input);
    revBancos();
    return r;
  },
);

export const adicionarItem = defineAction(
  {
    ...base,
    acao: "adicionar-item-composicao",
    entidade: "CustoComposicaoItem",
    schema: adicionarItemComposicaoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input) => {
    const r = await adicionarItemComposicao(input);
    revBancos();
    return r;
  },
);

export const removerItem = defineAction(
  {
    ...base,
    acao: "remover-item-composicao",
    entidade: "CustoComposicaoItem",
    schema: removerItemComposicaoSchema,
    entidadeId: (_data, input) => input.itemId,
  },
  async (input) => {
    const r = await removerItemComposicao(input.itemId);
    revBancos();
    return r;
  },
);

export const excluirComposicao = defineAction(
  {
    ...base,
    acao: "excluir-composicao-propria",
    entidade: "CustoComposicao",
    schema: excluirComposicaoPropriaSchema,
    entidadeId: (_data, input) => input.id,
  },
  async (input) => {
    const r = await excluirComposicaoPropria(input.id);
    revBancos();
    return r;
  },
);
