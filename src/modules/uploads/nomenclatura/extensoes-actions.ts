"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_EXTENSAO } from "./extensoes-iniciais";

/**
 * CRUD do catálogo de extensões (F2 da spec do motor de nomenclatura, §3.4). Mesmo gate da
 * Lista Mestre — não é uma permissão nova (`configuracoes:gerir` já existe e já abre esta área
 * de Configurações).
 */
const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;
const categoriaSchema = z.enum(CATEGORIAS_EXTENSAO);

/** Minúscula, sem ponto — "PDF" e ".pdf" viram "pdf". `0000.rvt` (backup do Revit) fica intacto. */
function normalizarExtensao(bruta: string): string {
  return bruta.trim().toLowerCase().replace(/^\./, "");
}

function rev() {
  revalidatePath("/configuracoes/extensoes");
}

export const criarExtensaoArquivo = defineAction(
  {
    ...base,
    acao: "criar-extensao-arquivo",
    entidade: "ExtensaoArquivo",
    schema: z.object({
      extensao: z.string().trim().min(1).max(20),
      categoria: categoriaSchema,
      software: z.string().trim().max(60).optional(),
      ehBackup: z.boolean().default(false),
      ehTemporario: z.boolean().default(false),
      ehConteiner: z.boolean().default(false),
      descricao: z.string().trim().max(200).optional(),
    }),
  },
  async (i) => {
    const extensao = normalizarExtensao(i.extensao);
    if (!extensao) throw new ActionError("Informe a extensão.");
    if (await prisma.extensaoArquivo.findUnique({ where: { extensao }, select: { id: true } })) {
      throw new ActionError("Esta extensão já está cadastrada.");
    }
    const max = await prisma.extensaoArquivo.aggregate({ _max: { ordem: true } });
    const c = await prisma.extensaoArquivo.create({
      data: {
        extensao,
        categoria: i.categoria,
        software: i.software || null,
        ehBackup: i.ehBackup,
        ehTemporario: i.ehTemporario,
        ehConteiner: i.ehConteiner,
        descricao: i.descricao || null,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    rev();
    return { id: c.id };
  },
);

export const editarExtensaoArquivo = defineAction(
  {
    ...base,
    acao: "editar-extensao-arquivo",
    entidade: "ExtensaoArquivo",
    schema: z.object({
      id: z.string().min(1),
      categoria: categoriaSchema,
      software: z.string().trim().max(60).optional(),
      ehBackup: z.boolean(),
      ehTemporario: z.boolean(),
      ehConteiner: z.boolean(),
      descricao: z.string().trim().max(200).optional(),
      ativo: z.boolean(),
    }),
    capturarAntes: (i) => prisma.extensaoArquivo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await prisma.extensaoArquivo.update({
      where: { id: i.id },
      data: {
        categoria: i.categoria,
        software: i.software || null,
        ehBackup: i.ehBackup,
        ehTemporario: i.ehTemporario,
        ehConteiner: i.ehConteiner,
        descricao: i.descricao || null,
        ativo: i.ativo,
      },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirExtensaoArquivo = defineAction(
  {
    ...base,
    acao: "excluir-extensao-arquivo",
    entidade: "ExtensaoArquivo",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: (i) => prisma.extensaoArquivo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await prisma.extensaoArquivo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Cadastra a partir de uma extensão vista no acervo sem passar por todo o formulário. */
export const cadastrarExtensaoDesconhecida = defineAction(
  {
    ...base,
    acao: "cadastrar-extensao-desconhecida",
    entidade: "ExtensaoArquivo",
    schema: z.object({ extensao: z.string().trim().min(1).max(20), categoria: categoriaSchema }),
  },
  async (i) => {
    const extensao = normalizarExtensao(i.extensao);
    const max = await prisma.extensaoArquivo.aggregate({ _max: { ordem: true } });
    const c = await prisma.extensaoArquivo.upsert({
      where: { extensao },
      create: { extensao, categoria: i.categoria, ordem: (max._max.ordem ?? -1) + 1 },
      update: {},
    });
    rev();
    return { id: c.id };
  },
);
