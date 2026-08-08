"use server";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { defineAction, ActionError } from "@/lib/with-action";
import { removerArquivo } from "@/lib/storage";
import { criarReferenciaSchema, editarReferenciaSchema, idSchema } from "./schemas";

export const criarReferencia = defineAction(
  {
    modulo: "engenharia",
    acao: "criar-referencia",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: criarReferenciaSchema,
    entidade: "ReferenciaTecnica",
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, ctx) => {
    const r = await prisma.referenciaTecnica.create({
      data: {
        titulo: input.titulo,
        tipo: input.tipo,
        autorObra: input.autorObra || null,
        ano: input.ano ?? null,
        tags: input.tags ?? [],
        descricao: input.descricao || null,
        linkExterno: input.linkExterno || null,
        arquivoPath: input.meta?.caminho ?? null,
        arquivoNome: input.meta?.nomeArquivo ?? null,
        mime: input.meta?.mime ?? null,
        tamanho: input.meta?.tamanho ?? null,
        hashSha256: input.meta?.hashSha256 ?? null,
        autorId: ctx.user.id,
      },
    });
    return { id: r.id };
  },
);

export const editarReferencia = defineAction(
  {
    modulo: "engenharia",
    acao: "editar-referencia",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: editarReferenciaSchema,
    entidade: "ReferenciaTecnica",
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.referenciaTecnica.findUnique({ where: { id: input.id } }),
  },
  async (input, ctx) => {
    const atual = await prisma.referenciaTecnica.findUnique({ where: { id: input.id } });
    if (!atual) throw new ActionError("Referência não encontrada.");
    if (atual.autorId !== ctx.user.id && !(await can(ctx.user.role, "biblioteca_tecnica", "gerir"))) {
      throw new ActionError("Sem permissão para editar esta referência.");
    }

    // meta ausente = mantém o anexo atual; linkExterno vazio = remove o link.
    const arquivoFinal = input.meta ?? {
      caminho: atual.arquivoPath,
      nomeArquivo: atual.arquivoNome,
      mime: atual.mime,
      tamanho: atual.tamanho,
      hashSha256: atual.hashSha256,
    };
    const linkFinal = input.linkExterno || null;
    if (!arquivoFinal.caminho && !linkFinal) {
      throw new ActionError("Informe um arquivo anexo ou um link externo.");
    }

    const r = await prisma.referenciaTecnica.update({
      where: { id: input.id },
      data: {
        titulo: input.titulo,
        tipo: input.tipo,
        autorObra: input.autorObra || null,
        ano: input.ano ?? null,
        // tags omitido = mantém as atuais (só a view sempre envia; qualquer outro
        // chamador que omita não pode apagar tags existentes por acidente).
        tags: input.tags ?? atual.tags,
        descricao: input.descricao || null,
        linkExterno: linkFinal,
        arquivoPath: arquivoFinal.caminho ?? null,
        arquivoNome: arquivoFinal.nomeArquivo ?? null,
        mime: arquivoFinal.mime ?? null,
        tamanho: arquivoFinal.tamanho ?? null,
        hashSha256: arquivoFinal.hashSha256 ?? null,
      },
    });

    // Anexo trocado: apaga o arquivo antigo do disco (best-effort).
    if (input.meta && atual.arquivoPath && atual.arquivoPath !== input.meta.caminho) {
      await removerArquivo(atual.arquivoPath).catch(() => {});
    }

    return { id: r.id };
  },
);

export const excluirReferencia = defineAction(
  {
    modulo: "engenharia",
    acao: "excluir-referencia",
    recurso: "biblioteca_tecnica",
    permissao: "incluir",
    schema: idSchema,
    entidade: "ReferenciaTecnica",
    entidadeId: (_data, input) => input.id,
    capturarAntes: (input) => prisma.referenciaTecnica.findUnique({ where: { id: input.id } }),
  },
  async (input, ctx) => {
    const r = await prisma.referenciaTecnica.findUnique({ where: { id: input.id } });
    if (!r) throw new ActionError("Referência não encontrada.");
    if (r.autorId !== ctx.user.id && !(await can(ctx.user.role, "biblioteca_tecnica", "gerir"))) {
      throw new ActionError("Sem permissão para excluir esta referência.");
    }
    await prisma.referenciaTecnica.delete({ where: { id: input.id } });
    if (r.arquivoPath) await removerArquivo(r.arquivoPath).catch(() => {});
    return { id: input.id };
  },
);
