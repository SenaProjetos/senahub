"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import * as service from "./service";
import { buscarFornecedoresParaConvite, historicoPrecoInsumo, historicoPrecoFornecedor } from "./queries";
import {
  criarRfqSchema,
  convidarFornecedorSchema,
  registrarPropostaSchema,
  escolherVencedorSchema,
  adicionarAnexoPropostaSchema,
  idSchema,
  idRfqSchema,
} from "./schemas";
import { z } from "zod";

const base = { modulo: "custos", recurso: "custos", permissao: "cotacao" } as const;
const leitura = { modulo: "custos", recurso: "custos", permissao: "cotacao", audit: false } as const;

const PATH = "/custos/cotacoes";
const rev = (id?: string) => {
  revalidatePath(PATH);
  if (id) revalidatePath(`${PATH}/${id}`);
};

export const criarRfq = defineAction(
  { ...base, acao: "criar-rfq", entidade: "CustoRfq", schema: criarRfqSchema, entidadeId: (data) => (data as { id: string }).id },
  async (input, { user }) => {
    const r = await service.criarRfq(input, user.id);
    rev();
    return r;
  },
);

export const convidarFornecedores = defineAction(
  { ...base, acao: "convidar-fornecedores", entidade: "CustoRfq", schema: convidarFornecedorSchema, entidadeId: (_d, input) => input.rfqId },
  async (input) => {
    await service.convidarFornecedores(input.rfqId, input.fornecedorIds);
    rev(input.rfqId);
    return { ok: true };
  },
);

export const registrarProposta = defineAction(
  {
    ...base,
    acao: "registrar-proposta",
    entidade: "CustoProposta",
    schema: registrarPropostaSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    const r = await service.registrarProposta(input, user.id);
    rev(input.rfqId);
    return r;
  },
);

export const escolherVencedor = defineAction(
  {
    ...base,
    acao: "escolher-vencedor",
    entidade: "CustoProposta",
    schema: escolherVencedorSchema,
    entidadeId: (_d, input) => input.propostaId,
    capturarAntes: (input) => prisma.custoProposta.findUnique({ where: { id: input.propostaId }, select: { status: true } }),
  },
  async (input, { user }) => {
    const proposta = await prisma.custoProposta.findUnique({ where: { id: input.propostaId }, select: { rfqId: true } });
    const r = await service.escolherVencedor(input.propostaId, input.justificativaEscolha, user.id);
    rev(proposta?.rfqId);
    return r;
  },
);

export const adicionarAnexoProposta = defineAction(
  { ...base, acao: "add-anexo-proposta", entidade: "CustoPropostaAnexo", schema: adicionarAnexoPropostaSchema },
  async (input, { user }) => {
    const a = await prisma.custoPropostaAnexo.create({
      data: { propostaId: input.propostaId, ...input.meta, autorId: user.id },
    });
    rev();
    return { id: a.id };
  },
);

export const removerAnexoProposta = defineAction(
  { ...base, acao: "rm-anexo-proposta", entidade: "CustoPropostaAnexo", schema: idSchema },
  async (input) => {
    const r = await service.excluirAnexoProposta(input.id);
    rev();
    return r;
  },
);

// ── Leituras ─────────────────────────────────────────────────────

export const buscarFornecedoresConvite = defineAction(
  { ...leitura, acao: "buscar-fornecedores-convite", schema: idRfqSchema.extend({ q: z.string().optional() }) },
  async (input) => buscarFornecedoresParaConvite(input.rfqId, input.q),
);

export const buscarHistoricoPrecoInsumo = defineAction(
  { ...leitura, acao: "historico-preco-insumo", schema: z.object({ insumoId: z.string().min(1) }) },
  async (input) => historicoPrecoInsumo(input.insumoId),
);

export const buscarHistoricoPrecoFornecedor = defineAction(
  { ...leitura, acao: "historico-preco-fornecedor", schema: z.object({ fornecedorId: z.string().min(1) }) },
  async (input) => historicoPrecoFornecedor(input.fornecedorId),
);
