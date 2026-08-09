"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Role, EscopoDeDados } from "@/lib/roles";
import { escopoProjeto } from "@/modules/projetos/queries";
import { escopoCustoOrcamento } from "./queries";
import * as service from "./service";
import {
  criarOrcamentoSchema,
  atualizarCabecalhoSchema,
  atualizarBdiSchema,
  atualizarEncargosSchema,
  cancelarOrcamentoSchema,
} from "./schemas";

const base = { modulo: "custos", recurso: "custos", permissao: "gerir", entidade: "CustoOrcamento" } as const;
const rev = (id?: string) => {
  revalidatePath("/custos");
  if (id) revalidatePath(`/custos/${id}`);
};

/** Garante que o orçamento existe e está dentro do escopo de acesso do usuário (D1). */
async function exigirNoEscopo(id: string, viewer: { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados) {
  const r = await prisma.custoOrcamento.findFirst({
    where: { AND: [{ id }, escopoCustoOrcamento(viewer)] },
    select: { id: true },
  });
  if (!r) throw new ActionError("Orçamento não encontrado.");
}

/** Projetos dentro do escopo do usuário, para o seletor do "novo orçamento". */
export const listarProjetosParaOrcamento = defineAction(
  { ...base, acao: "listar-projetos", schema: z.object({}), audit: false },
  async (_input, { user }) => {
    return prisma.projeto.findMany({
      where: escopoProjeto(user),
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    });
  },
);

/** Clientes ativos, para o seletor de contratante do "novo orçamento". */
export const listarClientesParaOrcamento = defineAction(
  { ...base, acao: "listar-clientes", schema: z.object({}), audit: false },
  async () => {
    return prisma.cliente.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
  },
);

export const criarOrcamento = defineAction(
  {
    ...base,
    acao: "criar-orcamento",
    schema: criarOrcamentoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    if (input.projetoId) {
      const projeto = await prisma.projeto.findFirst({
        where: { AND: [{ id: input.projetoId }, escopoProjeto(user)] },
        select: { id: true },
      });
      if (!projeto) throw new ActionError("Projeto não encontrado.");
    }
    return service.criarOrcamento(input, user.id);
  },
);

export const atualizarCabecalho = defineAction(
  {
    ...base,
    acao: "atualizar-cabecalho",
    schema: atualizarCabecalhoSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamento.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    await exigirNoEscopo(input.id, user);
    const r = await service.atualizarCabecalho(input);
    rev(r.id);
    return r;
  },
);

export const atualizarBdi = defineAction(
  {
    ...base,
    acao: "atualizar-bdi",
    schema: atualizarBdiSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamento.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    await exigirNoEscopo(input.id, user);
    const { id, ...entrada } = input;
    const r = await service.atualizarBdi(id, entrada);
    rev(r.id);
    return r;
  },
);

export const atualizarEncargos = defineAction(
  {
    ...base,
    acao: "atualizar-encargos",
    schema: atualizarEncargosSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamento.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    await exigirNoEscopo(input.id, user);
    const r = await service.atualizarEncargos(input.id, input.regime, input.overrides);
    rev(r.id);
    return r;
  },
);

export const cancelarOrcamento = defineAction(
  {
    ...base,
    acao: "cancelar-orcamento",
    schema: cancelarOrcamentoSchema,
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.custoOrcamento.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    await exigirNoEscopo(input.id, user);
    const r = await service.cancelarOrcamento(input.id);
    rev(r.id);
    return r;
  },
);
