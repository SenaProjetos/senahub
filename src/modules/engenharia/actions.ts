"use server";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { defineAction, ActionError } from "@/lib/with-action";
import { removerArquivo } from "@/lib/storage";
import { criarPadraoSchema, criarNormaSchema, idSchema } from "./schemas";

// ── Padrões técnicos ──

export const criarPadrao = defineAction(
  {
    modulo: "engenharia",
    acao: "criar-padrao",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: criarPadraoSchema,
    entidade: "PadraoTecnico",
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, ctx) => {
    // Disciplina informada precisa existir (FK opcional; "" = geral).
    if (input.disciplinaId) {
      const disc = await prisma.disciplinaCatalogo.findUnique({ where: { id: input.disciplinaId }, select: { id: true } });
      if (!disc) throw new ActionError("Disciplina inválida.");
    }
    const p = await prisma.padraoTecnico.create({
      data: {
        titulo: input.titulo,
        descricao: input.descricao || null,
        tipo: input.tipo || null,
        disciplinaId: input.disciplinaId || null,
        arquivoPath: input.meta.caminho,
        arquivoNome: input.meta.nomeArquivo,
        mime: input.meta.mime ?? null,
        tamanho: input.meta.tamanho,
        hashSha256: input.meta.hashSha256 ?? null,
        autorId: ctx.user.id,
      },
    });
    return { id: p.id };
  },
);

export const excluirPadrao = defineAction(
  {
    modulo: "engenharia",
    acao: "excluir-padrao",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: idSchema,
    entidade: "PadraoTecnico",
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.padraoTecnico.findUnique({ where: { id: input.id } }),
  },
  async (input, ctx) => {
    const p = await prisma.padraoTecnico.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Padrão não encontrado.");
    // Autor mexe no próprio; para excluir de terceiros exige `gerir` (admin bypassa).
    if (p.autorId !== ctx.user.id && !(await can(ctx.user.role, "biblioteca_tecnica", "gerir"))) {
      throw new ActionError("Sem permissão para excluir este padrão.");
    }
    await prisma.padraoTecnico.delete({ where: { id: input.id } });
    await removerArquivo(p.arquivoPath).catch(() => {});
    return { id: input.id };
  },
);

// ── Normas técnicas ──

export const criarNorma = defineAction(
  {
    modulo: "engenharia",
    acao: "criar-norma",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: criarNormaSchema,
    entidade: "NormaTecnica",
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, ctx) => {
    const n = await prisma.normaTecnica.create({
      data: {
        numero: input.numero,
        titulo: input.titulo,
        ano: input.ano,
        arquivoPath: input.meta.caminho,
        arquivoNome: input.meta.nomeArquivo,
        mime: input.meta.mime ?? null,
        tamanho: input.meta.tamanho,
        hashSha256: input.meta.hashSha256 ?? null,
        autorId: ctx.user.id,
      },
    });
    return { id: n.id };
  },
);

export const excluirNorma = defineAction(
  {
    modulo: "engenharia",
    acao: "excluir-norma",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: idSchema,
    entidade: "NormaTecnica",
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.normaTecnica.findUnique({ where: { id: input.id } }),
  },
  async (input, ctx) => {
    const n = await prisma.normaTecnica.findUnique({ where: { id: input.id } });
    if (!n) throw new ActionError("Norma não encontrada.");
    if (n.autorId !== ctx.user.id && !(await can(ctx.user.role, "biblioteca_tecnica", "gerir"))) {
      throw new ActionError("Sem permissão para excluir esta norma.");
    }
    await prisma.normaTecnica.delete({ where: { id: input.id } });
    await removerArquivo(n.arquivoPath).catch(() => {});
    return { id: input.id };
  },
);
