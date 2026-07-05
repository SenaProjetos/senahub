"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { metaDocumento, ORIGENS_DOCUMENTO } from "./schemas";

// Fase 1 ancora na proposta (comercial). Gate reusa o recurso `comercial` para não
// abrir lacuna de permissão (mesma regra dos antigos anexos). Fase 2+ (projeto/portal)
// revisita o gate — ver spec 2026-07-05-recebidos-documentos-cliente.md §4.
const base = {
  modulo: "documentos_cliente",
  recurso: "comercial",
  permissao: "gerir",
} as const;

function revalidar(propostaId: string | null, projetoId: string | null) {
  if (propostaId) revalidatePath(`/comercial/propostas/${propostaId}`);
  if (projetoId) revalidatePath(`/projetos/${projetoId}/arquivos`);
}

/** Resolve o cliente-dono a partir da âncora (proposta ou projeto). */
async function resolverCliente(propostaId?: string, projetoId?: string): Promise<string> {
  if (propostaId) {
    const p = await prisma.proposta.findUnique({ where: { id: propostaId }, select: { clienteId: true } });
    if (!p) throw new ActionError("Proposta não encontrada.");
    return p.clienteId;
  }
  if (projetoId) {
    const p = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { clienteId: true } });
    if (!p) throw new ActionError("Projeto não encontrado.");
    return p.clienteId;
  }
  throw new ActionError("Informe a proposta ou o projeto de destino.");
}

export const criarDocumento = defineAction(
  {
    ...base,
    acao: "criar-documento",
    entidade: "Documento",
    entidadeId: (d) => (d as { id?: string } | undefined)?.id,
    schema: z.object({
      propostaId: z.string().min(1).optional(),
      projetoId: z.string().min(1).optional(),
      nome: z.string().trim().min(1, "Informe o nome."),
      categoria: z.string().trim().optional().or(z.literal("")),
      descricao: z.string().trim().optional().or(z.literal("")),
      origem: z.enum(ORIGENS_DOCUMENTO).optional(),
      meta: metaDocumento,
    }),
  },
  async (i, ctx) => {
    const clienteId = await resolverCliente(i.propostaId, i.projetoId);
    const doc = await prisma.documento.create({
      data: {
        clienteId,
        propostaId: i.propostaId ?? null,
        projetoId: i.projetoId ?? null,
        origem: i.origem ?? (i.propostaId ? "comercial" : "recebido_cliente"),
        canal: "interno",
        nome: i.nome,
        categoria: i.categoria || null,
        descricao: i.descricao || null,
        autorId: ctx.user.id,
        versoes: {
          create: {
            numero: 1,
            caminho: i.meta.caminho,
            nomeArquivo: i.meta.nomeArquivo,
            mime: i.meta.mime,
            tamanho: i.meta.tamanho,
            hashSha256: i.meta.hashSha256,
            autorId: ctx.user.id,
          },
        },
      },
    });
    revalidar(i.propostaId ?? null, i.projetoId ?? null);
    return { id: doc.id };
  },
);

export const adicionarVersaoDocumento = defineAction(
  {
    ...base,
    acao: "adicionar-versao-documento",
    entidade: "DocumentoVersao",
    entidadeId: (d, i) => ((d ?? i) as { documentoId: string }).documentoId,
    schema: z.object({ documentoId: z.string().min(1), meta: metaDocumento }),
  },
  async (i, ctx) => {
    const doc = await prisma.documento.findUnique({
      where: { id: i.documentoId },
      select: { propostaId: true, projetoId: true, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    const numero = (doc.versoes[0]?.numero ?? 0) + 1;
    await prisma.documentoVersao.create({
      data: {
        documentoId: i.documentoId,
        numero,
        caminho: i.meta.caminho,
        nomeArquivo: i.meta.nomeArquivo,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        hashSha256: i.meta.hashSha256,
        autorId: ctx.user.id,
      },
    });
    await prisma.documento.update({ where: { id: i.documentoId }, data: { updatedAt: new Date() } });
    revalidar(doc.propostaId, doc.projetoId);
    return { numero };
  },
);

export const editarDocumento = defineAction(
  {
    ...base,
    acao: "editar-documento",
    entidade: "Documento",
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    schema: z.object({
      id: z.string().min(1),
      nome: z.string().trim().min(1, "Informe o nome."),
      categoria: z.string().trim().optional().or(z.literal("")),
      descricao: z.string().trim().optional().or(z.literal("")),
    }),
  },
  async (i) => {
    const doc = await prisma.documento.update({
      where: { id: i.id },
      data: { nome: i.nome, categoria: i.categoria || null, descricao: i.descricao || null },
      select: { propostaId: true, projetoId: true },
    });
    revalidar(doc.propostaId, doc.projetoId);
    return { id: i.id };
  },
);

export const excluirDocumento = defineAction(
  {
    ...base,
    acao: "excluir-documento",
    entidade: "Documento",
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    const doc = await prisma.documento.findUnique({
      where: { id: i.id },
      select: { propostaId: true, projetoId: true, versoes: { select: { caminho: true } } },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    await prisma.documento.delete({ where: { id: i.id } });
    for (const v of doc.versoes) await removerArquivo(v.caminho);
    revalidar(doc.propostaId, doc.projetoId);
    return { id: i.id };
  },
);
