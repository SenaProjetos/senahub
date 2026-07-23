"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { moverArquivo, existeArquivo } from "@/lib/storage";
import { slugSegmento } from "@/modules/projetos/estrutura-tipo";
import {
  criarPastaPersonalizadaSchema,
  renomearPastaPersonalizadaSchema,
  excluirPastaPersonalizadaSchema,
  moverArquivoDePastaSchema,
} from "@/modules/projetos/pastas/schemas";

function revalidarProjeto(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

/**
 * Cria uma pasta/subpasta personalizada dentro da árvore de uma disciplina — em
 * QUALQUER projeto (não só aprovação/laudo). Restrito a admin. `caminho` segue o
 * mesmo esquema de `achatarTemplate` (slug do nome, unido ao caminho do pai).
 */
export const criarPastaPersonalizada = defineAction(
  {
    modulo: "projetos",
    acao: "criar-pasta-personalizada",
    recurso: "projetos",
    permissao: "gerir",
    roles: ["admin"],
    entidade: "PastaProjeto",
    schema: criarPastaPersonalizadaSchema,
    entidadeId: (d) => (d as { pastaId: string } | undefined)?.pastaId,
  },
  async (input) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: { id: true, projetoId: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    let parentCaminho: string | null = null;
    if (input.parentId) {
      const parent = await prisma.pastaProjeto.findUnique({
        where: { id: input.parentId },
        select: { disciplinaId: true, caminho: true },
      });
      if (!parent || parent.disciplinaId !== input.disciplinaId) {
        throw new ActionError("Pasta-mãe não encontrada nesta disciplina.");
      }
      parentCaminho = parent.caminho;
    }

    const caminho = parentCaminho ? `${parentCaminho}/${slugSegmento(input.nome)}` : slugSegmento(input.nome);
    const existente = await prisma.pastaProjeto.findFirst({
      where: { disciplinaId: input.disciplinaId, caminho },
      select: { id: true },
    });
    if (existente) throw new ActionError("Já existe uma pasta com esse nome neste nível.");

    const maxOrdem = await prisma.pastaProjeto.aggregate({
      where: { disciplinaId: input.disciplinaId, parentId: input.parentId ?? null },
      _max: { ordem: true },
    });
    const pasta = await prisma.pastaProjeto.create({
      data: {
        disciplinaId: input.disciplinaId,
        parentId: input.parentId ?? null,
        nome: input.nome.trim(),
        caminho,
        origem: "custom",
        ordem: (maxOrdem._max.ordem ?? -1) + 1,
      },
    });

    revalidarProjeto(disciplina.projetoId);
    return { pastaId: pasta.id };
  },
);

/** Renomeia o RÓTULO de uma pasta personalizada (não move nada em disco — `caminho` não muda). */
export const renomearPastaPersonalizada = defineAction(
  {
    modulo: "projetos",
    acao: "renomear-pasta-personalizada",
    recurso: "projetos",
    permissao: "gerir",
    roles: ["admin"],
    entidade: "PastaProjeto",
    schema: renomearPastaPersonalizadaSchema,
    entidadeId: (d, i) => ((d ?? i) as { pastaId: string }).pastaId,
  },
  async (input) => {
    const pasta = await prisma.pastaProjeto.findUnique({
      where: { id: input.pastaId },
      select: { origem: true, disciplina: { select: { projetoId: true } } },
    });
    if (!pasta) throw new ActionError("Pasta não encontrada.");
    if (pasta.origem !== "custom") {
      throw new ActionError("Só é possível renomear pastas personalizadas — as de template são fixas.");
    }
    await prisma.pastaProjeto.update({ where: { id: input.pastaId }, data: { nome: input.nome.trim() } });
    revalidarProjeto(pasta.disciplina.projetoId);
    return { pastaId: input.pastaId };
  },
);

/** Exclui uma pasta personalizada VAZIA (sem arquivos diretos nem subpastas). */
export const excluirPastaPersonalizada = defineAction(
  {
    modulo: "projetos",
    acao: "excluir-pasta-personalizada",
    recurso: "projetos",
    permissao: "gerir",
    roles: ["admin"],
    entidade: "PastaProjeto",
    schema: excluirPastaPersonalizadaSchema,
    entidadeId: (d, i) => ((d ?? i) as { pastaId: string }).pastaId,
  },
  async (input) => {
    const pasta = await prisma.pastaProjeto.findUnique({
      where: { id: input.pastaId },
      select: {
        origem: true,
        disciplina: { select: { projetoId: true } },
        _count: { select: { uploads: true, filhos: true } },
      },
    });
    if (!pasta) throw new ActionError("Pasta não encontrada.");
    if (pasta.origem !== "custom") {
      throw new ActionError("Só é possível excluir pastas personalizadas — as de template são fixas.");
    }
    if (pasta._count.uploads > 0 || pasta._count.filhos > 0) {
      throw new ActionError("A pasta não está vazia — remova os arquivos/subpastas antes de excluir.");
    }
    await prisma.pastaProjeto.delete({ where: { id: input.pastaId } });
    revalidarProjeto(pasta.disciplina.projetoId);
    return { pastaId: input.pastaId };
  },
);

/**
 * Move um arquivo (Upload) para outra pasta da MESMA disciplina — vale para qualquer
 * nó da árvore (template ou custom), não só pastas personalizadas, para permitir
 * reorganizar arquivos enviados no lugar errado.
 */
export const moverArquivoDePasta = defineAction(
  {
    modulo: "projetos",
    acao: "mover-arquivo-de-pasta",
    recurso: "projetos",
    permissao: "gerir",
    roles: ["admin"],
    entidade: "Upload",
    schema: moverArquivoDePastaSchema,
    entidadeId: (d, i) => ((d ?? i) as { uploadId: string }).uploadId,
  },
  async (input) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { id: true, disciplinaId: true, caminho: true, nomeArquivo: true, pastaId: true },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");

    const pastaDestino = await prisma.pastaProjeto.findUnique({
      where: { id: input.pastaId },
      select: { id: true, disciplinaId: true, caminho: true, disciplina: { select: { projetoId: true } } },
    });
    if (!pastaDestino || pastaDestino.disciplinaId !== upload.disciplinaId) {
      throw new ActionError("Pasta de destino inválida para este arquivo.");
    }
    if (upload.pastaId === pastaDestino.id) {
      throw new ActionError("O arquivo já está nesta pasta.");
    }

    const caminhoNovo = `${pastaDestino.caminho}/${upload.nomeArquivo}`;
    if (await existeArquivo(caminhoNovo)) {
      throw new ActionError("Já existe um arquivo com esse nome na pasta de destino.");
    }
    await moverArquivo(upload.caminho, caminhoNovo);
    await prisma.upload.update({
      where: { id: upload.id },
      data: { pastaId: pastaDestino.id, pacote: null, caminho: caminhoNovo },
    });

    revalidarProjeto(pastaDestino.disciplina.projetoId);
    return { uploadId: upload.id };
  },
);
