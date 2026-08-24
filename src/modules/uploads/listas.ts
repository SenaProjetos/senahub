"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";

const base = { modulo: "uploads", recurso: "projetos", permissao: "ver" } as const;
const nomeLista = z.string().trim().min(1, "Informe o nome da lista.").max(100, "O nome pode ter no máximo 100 caracteres.");

function revalidarListas(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

/**
 * Regra decidida para F2-PR7: a lista é compartilhada entre os viewers do projeto;
 * só a gestão do projeto ou alguém responsável por ao menos uma disciplina pode geri-la.
 * A verificação de cada documento, feita abaixo, continua mais estreita para responsáveis.
 */
async function exigirGestaoListas(user: SessionUser, projetoId: string) {
  const [projeto, podeGerirProjeto, responsavel] = await Promise.all([
    projetoVisivel(user, projetoId),
    can(user, "projetos", "gerir"),
    prisma.disciplinaResponsavel.findFirst({
      where: { userId: user.id, disciplina: { projetoId } },
      select: { id: true },
    }),
  ]);
  if (!projeto) throw new ActionError("Lista não encontrada.");
  if (!podeGerirProjeto && !responsavel) {
    throw new ActionError("Somente responsáveis por disciplina ou a gestão do projeto podem gerir listas.");
  }
  return { podeGerirProjeto };
}

/** Impede que um responsável de uma disciplina use uma lista compartilhada para operar outra. */
function exigirEscopoDoDocumento(
  documento: { disciplina: { responsaveis: { userId: string }[] } },
  userId: string,
  podeGerirProjeto: boolean,
) {
  if (podeGerirProjeto) return;
  if (!documento.disciplina.responsaveis.some((responsavel) => responsavel.userId === userId)) {
    throw new ActionError("Documento não encontrado.");
  }
}

export const criarListaDocumentos = defineAction(
  {
    ...base,
    acao: "criar-lista-documentos",
    entidade: "ListaDocumentos",
    schema: z.object({ projetoId: z.string().min(1), nome: nomeLista }),
    entidadeId: (data) => (data as { projetoId: string }).projetoId,
  },
  async (input, { user }) => {
    await exigirGestaoListas(user, input.projetoId);
    const lista = await prisma.listaDocumentos.create({
      data: { projetoId: input.projetoId, nome: input.nome, criadoPorId: user.id },
      select: { id: true, nome: true },
    });
    revalidarListas(input.projetoId);
    return lista;
  },
);

export const renomearListaDocumentos = defineAction(
  {
    ...base,
    acao: "renomear-lista-documentos",
    entidade: "ListaDocumentos",
    schema: z.object({ listaId: z.string().min(1), nome: nomeLista }),
    entidadeId: (data) => (data as { listaId: string }).listaId,
    capturarAntes: (input) => prisma.listaDocumentos.findUnique({ where: { id: input.listaId }, select: { nome: true, projetoId: true } }),
  },
  async (input, { user }) => {
    const lista = await prisma.listaDocumentos.findUnique({ where: { id: input.listaId }, select: { id: true, projetoId: true } });
    if (!lista) throw new ActionError("Lista não encontrada.");
    await exigirGestaoListas(user, lista.projetoId);
    await prisma.listaDocumentos.update({ where: { id: lista.id }, data: { nome: input.nome } });
    revalidarListas(lista.projetoId);
    return { id: lista.id, nome: input.nome };
  },
);

export const excluirListaDocumentos = defineAction(
  {
    ...base,
    acao: "excluir-lista-documentos",
    entidade: "ListaDocumentos",
    schema: z.object({ listaId: z.string().min(1) }),
    entidadeId: (data) => (data as { listaId: string }).listaId,
    capturarAntes: (input) => prisma.listaDocumentos.findUnique({ where: { id: input.listaId }, select: { nome: true, projetoId: true, _count: { select: { itens: true } } } }),
  },
  async (input, { user }) => {
    const lista = await prisma.listaDocumentos.findUnique({ where: { id: input.listaId }, select: { id: true, projetoId: true } });
    if (!lista) throw new ActionError("Lista não encontrada.");
    await exigirGestaoListas(user, lista.projetoId);
    await prisma.listaDocumentos.delete({ where: { id: lista.id } });
    revalidarListas(lista.projetoId);
    return { id: lista.id };
  },
);

export const adicionarDocumentoLista = defineAction(
  {
    ...base,
    acao: "adicionar-documento-lista",
    entidade: "ListaDocumentoItem",
    schema: z.object({ listaId: z.string().min(1), documentoId: z.string().min(1) }),
    entidadeId: (data) => (data as { listaId: string }).listaId,
    capturarAntes: (input) => prisma.listaDocumentoItem.findUnique({ where: { listaId_documentoId: input }, select: { id: true } }),
  },
  async (input, { user }) => {
    const [lista, documento] = await Promise.all([
      prisma.listaDocumentos.findUnique({ where: { id: input.listaId }, select: { id: true, projetoId: true } }),
      prisma.documentoDisciplina.findUnique({
        where: { id: input.documentoId },
        select: { id: true, substituidoPorId: true, disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } } },
      }),
    ]);
    if (!lista) throw new ActionError("Lista não encontrada.");
    if (!documento || documento.substituidoPorId || documento.disciplina.projetoId !== lista.projetoId) {
      throw new ActionError("Documento não encontrado.");
    }
    const { podeGerirProjeto } = await exigirGestaoListas(user, lista.projetoId);
    exigirEscopoDoDocumento(documento, user.id, podeGerirProjeto);
    await prisma.listaDocumentoItem.upsert({
      where: { listaId_documentoId: { listaId: lista.id, documentoId: documento.id } },
      create: { listaId: lista.id, documentoId: documento.id },
      update: {},
    });
    revalidarListas(lista.projetoId);
    return { listaId: lista.id, documentoId: documento.id };
  },
);

export const removerDocumentoLista = defineAction(
  {
    ...base,
    acao: "remover-documento-lista",
    entidade: "ListaDocumentoItem",
    schema: z.object({ listaId: z.string().min(1), documentoId: z.string().min(1) }),
    entidadeId: (data) => (data as { listaId: string }).listaId,
    capturarAntes: (input) => prisma.listaDocumentoItem.findUnique({ where: { listaId_documentoId: input }, select: { id: true, listaId: true, documentoId: true } }),
  },
  async (input, { user }) => {
    const item = await prisma.listaDocumentoItem.findUnique({
      where: { listaId_documentoId: input },
      select: {
        id: true,
        lista: { select: { projetoId: true } },
        documento: { select: { disciplina: { select: { responsaveis: { select: { userId: true } } } } } },
      },
    });
    if (!item) throw new ActionError("Documento não encontrado na lista.");
    const { podeGerirProjeto } = await exigirGestaoListas(user, item.lista.projetoId);
    exigirEscopoDoDocumento(item.documento, user.id, podeGerirProjeto);
    await prisma.listaDocumentoItem.delete({ where: { id: item.id } });
    revalidarListas(item.lista.projetoId);
    return { listaId: input.listaId, documentoId: input.documentoId };
  },
);
