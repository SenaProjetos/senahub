"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import {
  adicionarCamadaSchema,
  atualizarCamadaSchema,
  confirmarAlinhamentoSchema,
  criarSobreposicaoSchema,
  idCamadaSchema,
  idSobreposicaoSchema,
  renomearSobreposicaoSchema,
  salvarAlinhamentoSchema,
} from "./schemas";
import {
  adicionarCamadaNoBanco,
  atualizarCamadaNoBanco,
  confirmarAlinhamentoNoBanco,
  criarSobreposicaoNoBanco,
  definirBaseNoBanco,
  excluirSobreposicaoNoBanco,
  projetoDaCamada,
  projetoDaSobreposicao,
  removerCamadaNoBanco,
  renomearSobreposicaoNoBanco,
  salvarAlinhamentoNoBanco,
} from "./service";

const BASE = { modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir", interno: true } as const;

/** Mesma regra da página: só quem enxerga o projeto mexe nas sobreposições dele. */
async function exigirProjeto(user: SessionUser, projetoId: string): Promise<void> {
  if (!(await projetoVisivel(user, projetoId))) throw new ActionError("Você não participa deste projeto.");
}

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/coordenacao/sobreposicao`);
}

async function camadaAntes(camadaId: string) {
  return prisma.sobreposicaoCamada.findUnique({ where: { id: camadaId } });
}

async function alinhamentoAntes(camadaId: string, formato: string) {
  return prisma.sobreposicaoAlinhamento.findUnique({ where: { camadaId_formato: { camadaId, formato } } });
}

export const criarSobreposicao = defineAction(
  { ...BASE, acao: "sobreposicao-criar", entidade: "SobreposicaoPlanta", schema: criarSobreposicaoSchema, entidadeId: (d) => (d as { id: string }).id },
  async (input, { user }) => {
    await exigirProjeto(user, input.projetoId);
    const r = await criarSobreposicaoNoBanco(prisma, input, user.id);
    revalidar(input.projetoId);
    return r;
  },
);

export const renomearSobreposicao = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-renomear",
    entidade: "SobreposicaoPlanta",
    schema: renomearSobreposicaoSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (input) => prisma.sobreposicaoPlanta.findUnique({ where: { id: input.id } }),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaSobreposicao(prisma, input.id);
    await exigirProjeto(user, projetoId);
    await renomearSobreposicaoNoBanco(prisma, input);
    revalidar(projetoId);
  },
);

export const excluirSobreposicao = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-excluir",
    entidade: "SobreposicaoPlanta",
    schema: idSobreposicaoSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (input) =>
      prisma.sobreposicaoPlanta.findUnique({ where: { id: input.id }, include: { camadas: { include: { alinhamentos: true } } } }),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaSobreposicao(prisma, input.id);
    await exigirProjeto(user, projetoId);
    await excluirSobreposicaoNoBanco(prisma, input);
    revalidar(projetoId);
  },
);

export const adicionarCamada = defineAction(
  { ...BASE, acao: "sobreposicao-adicionar-camada", entidade: "SobreposicaoCamada", schema: adicionarCamadaSchema, entidadeId: (d) => (d as { id: string }).id },
  async (input, { user }) => {
    const projetoId = await projetoDaSobreposicao(prisma, input.sobreposicaoId);
    await exigirProjeto(user, projetoId);
    const r = await adicionarCamadaNoBanco(prisma, input, user.id);
    revalidar(projetoId);
    return r;
  },
);

export const atualizarCamada = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-atualizar-camada",
    entidade: "SobreposicaoCamada",
    schema: atualizarCamadaSchema,
    entidadeId: (_d, i) => i.camadaId,
    capturarAntes: async (input) => camadaAntes(input.camadaId),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaCamada(prisma, input.camadaId);
    await exigirProjeto(user, projetoId);
    await atualizarCamadaNoBanco(prisma, input, user.id);
    revalidar(projetoId);
  },
);

export const removerCamada = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-remover-camada",
    entidade: "SobreposicaoCamada",
    schema: idCamadaSchema,
    entidadeId: (_d, i) => i.camadaId,
    capturarAntes: async (input) => prisma.sobreposicaoCamada.findUnique({ where: { id: input.camadaId }, include: { alinhamentos: true } }),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaCamada(prisma, input.camadaId);
    await exigirProjeto(user, projetoId);
    await removerCamadaNoBanco(prisma, input);
    revalidar(projetoId);
  },
);

export const definirBase = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-definir-base",
    entidade: "SobreposicaoCamada",
    schema: idCamadaSchema,
    entidadeId: (_d, i) => i.camadaId,
    capturarAntes: async (input) => camadaAntes(input.camadaId),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaCamada(prisma, input.camadaId);
    await exigirProjeto(user, projetoId);
    await definirBaseNoBanco(prisma, input, user.id);
    revalidar(projetoId);
  },
);

export const salvarAlinhamento = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-salvar-alinhamento",
    entidade: "SobreposicaoAlinhamento",
    schema: salvarAlinhamentoSchema,
    entidadeId: (_d, i) => i.camadaId,
    capturarAntes: async (input) => alinhamentoAntes(input.camadaId, input.formato),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaCamada(prisma, input.camadaId);
    await exigirProjeto(user, projetoId);
    const r = await salvarAlinhamentoNoBanco(prisma, input, user.id);
    revalidar(projetoId);
    return r;
  },
);

export const confirmarAlinhamento = defineAction(
  {
    ...BASE,
    acao: "sobreposicao-confirmar-alinhamento",
    entidade: "SobreposicaoAlinhamento",
    schema: confirmarAlinhamentoSchema,
    entidadeId: (_d, i) => i.camadaId,
    capturarAntes: async (input) => alinhamentoAntes(input.camadaId, input.formato),
  },
  async (input, { user }) => {
    const projetoId = await projetoDaCamada(prisma, input.camadaId);
    await exigirProjeto(user, projetoId);
    const r = await confirmarAlinhamentoNoBanco(prisma, input, user.id);
    revalidar(projetoId);
    return r;
  },
);
