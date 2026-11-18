"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { TIPOS_DE_ESTUDO } from "./acesso";
import { nomeEstudoSchema } from "./conteudo";
import { criarEstudo, duplicarEstudo, excluirEstudo, salvarEstudo } from "./service";

// Gate grosso = quem usa as ferramentas e é interno; o fino (motor liberado, projeto visível,
// responsável de disciplina) é o `exigirAcesso` do service, em toda ação.
const base = { modulo: "estudos", recurso: "ferramentas", permissao: "usar", interno: true, entidade: "EstudoProjeto" } as const;

const idSchema = z.object({ id: z.string().min(1, "Estudo inválido.") });

const atualizar = (projetoId: string, estudoId?: string) => {
  revalidatePath(`/projetos/${projetoId}/estudos`);
  if (estudoId) revalidatePath(`/projetos/${projetoId}/estudos/${estudoId}`);
};

export const criarEstudoAction = defineAction(
  {
    ...base,
    acao: "criar-estudo",
    schema: z.object({
      projetoId: z.string().min(1, "Projeto inválido."),
      nome: nomeEstudoSchema,
      tipo: z.enum(TIPOS_DE_ESTUDO, { message: "Tipo de estudo inválido." }).default("cargas_eletricas"),
    }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const r = await criarEstudo(user, i);
    atualizar(r.projetoId);
    return r;
  },
);

export const salvarEstudoAction = defineAction(
  {
    ...base,
    acao: "salvar-estudo",
    schema: z.object({
      id: z.string().min(1, "Estudo inválido."),
      versao: z.number().int().positive("Versão inválida."),
      nome: nomeEstudoSchema,
      // O esquema é o do TIPO do estudo, que só o service sabe (lê a linha): ele valida antes de gravar.
      conteudo: z.unknown(),
    }),
    entidadeId: (_d, i) => i.id,
    // O conteúdo anterior fica no log: é o histórico recuperável do estudo.
    capturarAntes: (i) =>
      prisma.estudoProjeto.findUnique({ where: { id: i.id }, select: { nome: true, versao: true, conteudo: true } }),
  },
  async (i, { user }) => {
    const r = await salvarEstudo(user, i);
    atualizar(r.projetoId, r.id);
    return r;
  },
);

export const duplicarEstudoAction = defineAction(
  { ...base, acao: "duplicar-estudo", schema: idSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i, { user }) => {
    const r = await duplicarEstudo(user, i);
    atualizar(r.projetoId);
    return r;
  },
);

export const excluirEstudoAction = defineAction(
  {
    ...base,
    acao: "excluir-estudo",
    schema: idSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) =>
      prisma.estudoProjeto.findUnique({ where: { id: i.id }, select: { projetoId: true, nome: true, versao: true, conteudo: true } }),
  },
  async (i, { user }) => {
    const r = await excluirEstudo(user, i);
    atualizar(r.projetoId);
    return r;
  },
);
