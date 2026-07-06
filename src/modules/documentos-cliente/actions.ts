"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { metaDocumento, ORIGENS_DOCUMENTO } from "./schemas";
import { podeGerirDocumento, type AncoraDocumento } from "./acesso";
import type { SessionUser } from "@/lib/session";

// Gate por sessão + verificação de acesso por âncora dentro de cada handler
// (proposta → comercial; projeto → membro interno/global). Ver `acesso.ts` e o
// spec 2026-07-05-recebidos-documentos-cliente.md §4.
const base = {
  modulo: "documentos_cliente",
} as const;

async function exigirEscrita(user: SessionUser, ancora: AncoraDocumento, origem?: string | null) {
  if (!(await podeGerirDocumento(user, ancora, origem))) throw new ActionError("Sem permissão para este documento.");
}

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
    await exigirEscrita(ctx.user, { propostaId: i.propostaId, projetoId: i.projetoId }, i.origem);
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
      select: { propostaId: true, projetoId: true, origem: true, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    await exigirEscrita(ctx.user, doc, doc.origem);
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
  async (i, ctx) => {
    const alvo = await prisma.documento.findUnique({ where: { id: i.id }, select: { propostaId: true, projetoId: true, origem: true } });
    if (!alvo) throw new ActionError("Documento não encontrado.");
    await exigirEscrita(ctx.user, alvo, alvo.origem);
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
  async (i, ctx) => {
    const doc = await prisma.documento.findUnique({
      where: { id: i.id },
      select: { propostaId: true, projetoId: true, origem: true, versoes: { select: { caminho: true } } },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    await exigirEscrita(ctx.user, doc, doc.origem);
    await prisma.documento.delete({ where: { id: i.id } });
    for (const v of doc.versoes) await removerArquivo(v.caminho);
    revalidar(doc.propostaId, doc.projetoId);
    return { id: i.id };
  },
);
