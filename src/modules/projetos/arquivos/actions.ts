"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";

const base = {
  modulo: "projetos",
  recurso: "arquivos_gerais",
  permissao: "gerir",
  // Correlação do histórico: toda ação do repo geral carrega o projetoId.
  entidadeId: (d: unknown, i: unknown) =>
    (i as { projetoId?: string })?.projetoId ?? (d as { projetoId?: string } | undefined)?.projetoId,
} as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const meta = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});

const rev = (projetoId: string) => revalidatePath(`/projetos/${projetoId}/arquivos`);

export const criarArquivo = defineAction(
  {
    ...base,
    acao: "criar-arquivo",
    entidade: "ArquivoProjeto",
    schema: z.object({
      projetoId: z.string().min(1),
      nome: z.string().min(1, "Informe o nome."),
      categoria: opt(z.string()),
      descricao: opt(z.string()),
      meta,
    }),
  },
  async (i, ctx) => {
    const a = await prisma.arquivoProjeto.create({
      data: {
        projetoId: i.projetoId,
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
    rev(i.projetoId);
    return { id: a.id };
  },
);

export const adicionarVersaoArquivo = defineAction(
  {
    ...base,
    acao: "adicionar-versao-arquivo",
    entidade: "ArquivoProjetoVersao",
    schema: z.object({ arquivoId: z.string().min(1), meta }),
  },
  async (i, ctx) => {
    const arq = await prisma.arquivoProjeto.findUnique({
      where: { id: i.arquivoId },
      select: { projetoId: true, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } },
    });
    if (!arq) throw new ActionError("Arquivo não encontrado.");
    const numero = (arq.versoes[0]?.numero ?? 0) + 1;
    await prisma.arquivoProjetoVersao.create({
      data: {
        arquivoId: i.arquivoId,
        numero,
        caminho: i.meta.caminho,
        nomeArquivo: i.meta.nomeArquivo,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        hashSha256: i.meta.hashSha256,
        autorId: ctx.user.id,
      },
    });
    await prisma.arquivoProjeto.update({ where: { id: i.arquivoId }, data: { updatedAt: new Date() } });
    rev(arq.projetoId);
    return { numero, projetoId: arq.projetoId };
  },
);

export const editarArquivo = defineAction(
  {
    ...base,
    acao: "editar-arquivo",
    entidade: "ArquivoProjeto",
    schema: z.object({
      id: z.string().min(1),
      nome: z.string().min(1, "Informe o nome."),
      categoria: opt(z.string()),
      descricao: opt(z.string()),
    }),
  },
  async (i) => {
    const a = await prisma.arquivoProjeto.update({
      where: { id: i.id },
      data: { nome: i.nome, categoria: i.categoria || null, descricao: i.descricao || null },
      select: { projetoId: true },
    });
    rev(a.projetoId);
    return { id: i.id, projetoId: a.projetoId };
  },
);

export const excluirArquivo = defineAction(
  { ...base, acao: "excluir-arquivo", entidade: "ArquivoProjeto", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const a = await prisma.arquivoProjeto.findUnique({
      where: { id: i.id },
      select: { projetoId: true, versoes: { select: { caminho: true } } },
    });
    if (!a) throw new ActionError("Arquivo não encontrado.");
    await prisma.arquivoProjeto.delete({ where: { id: i.id } });
    for (const v of a.versoes) await removerArquivo(v.caminho);
    rev(a.projetoId);
    return { id: i.id, projetoId: a.projetoId };
  },
);
