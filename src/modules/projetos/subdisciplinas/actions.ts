"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { subdisciplinasDoCard } from "./queries";
import { fraseSubEmUso } from "@/modules/projetos/nomenclatura/catalogo/todas";
import { garantirFaixaVersao } from "@/modules/uploads/nomenclatura/siglas-guardas";
import type { FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/configuracoes/nomenclatura", "layout");
}

/** Validade da sub por versão do padrão (D11). Na edição, ausente = mantém a gravada (o olho de
 *  ativar/desativar não manda). `versaoAte` null = sem fim. */
const faixaSchema = {
  versaoDesde: z.number().int().min(1).optional(),
  versaoAte: z.number().int().min(1).nullable().optional(),
};

export const listarSubdisciplinasAction = defineAction(
  { ...base, acao: "listar-subdisciplinas", audit: false, schema: z.object({ disciplinaCatalogoId: z.string().min(1) }) },
  async (i) => subdisciplinasDoCard(i.disciplinaCatalogoId),
);

export const criarSubdisciplina = defineAction(
  {
    ...base,
    acao: "criar-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    schema: z.object({ disciplinaCatalogoId: z.string().min(1), nome: z.string().trim().min(1).max(80), ...faixaSchema }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const faixa: FaixaVersao = { versaoDesde: i.versaoDesde ?? 1, versaoAte: i.versaoAte ?? null };
    await garantirFaixaVersao(faixa);
    const existe = await prisma.subdisciplinaCatalogo.findUnique({
      where: { disciplinaCatalogoId_nome: { disciplinaCatalogoId: i.disciplinaCatalogoId, nome: i.nome } },
      select: { id: true },
    });
    if (existe) throw new ActionError(`"${i.nome}" já existe neste card.`);
    const max = await prisma.subdisciplinaCatalogo.aggregate({
      where: { disciplinaCatalogoId: i.disciplinaCatalogoId },
      _max: { ordem: true },
    });
    const criada = await prisma.subdisciplinaCatalogo.create({
      data: { disciplinaCatalogoId: i.disciplinaCatalogoId, nome: i.nome, ...faixa, ordem: (max._max.ordem ?? -1) + 1 },
    });
    rev();
    return { id: criada.id };
  },
);

export const editarSubdisciplina = defineAction(
  {
    ...base,
    acao: "editar-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80), ativo: z.boolean(), ...faixaSchema }),
    capturarAntes: (i) => prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.subdisciplinaCatalogo.findUnique({
      where: { id: i.id },
      select: { disciplinaCatalogoId: true, versaoDesde: true, versaoAte: true },
    });
    if (!existe) throw new ActionError("Sub-disciplina não encontrada.");
    const faixa: FaixaVersao = {
      versaoDesde: i.versaoDesde ?? existe.versaoDesde,
      versaoAte: i.versaoAte === undefined ? existe.versaoAte : i.versaoAte,
    };
    await garantirFaixaVersao(faixa);
    const conflito = await prisma.subdisciplinaCatalogo.findFirst({
      where: { disciplinaCatalogoId: existe.disciplinaCatalogoId, nome: i.nome, id: { not: i.id } },
      select: { id: true },
    });
    if (conflito) throw new ActionError(`"${i.nome}" já existe neste card.`);
    await prisma.subdisciplinaCatalogo.update({ where: { id: i.id }, data: { nome: i.nome, ativo: i.ativo, ...faixa } });
    rev();
    return { id: i.id };
  },
);

/** Lápis do catálogo (spec 2026-09-30, E9): só o nome da sub — validade e siglas são da lente de uma versão. */
export const editarNomeSubdisciplina = defineAction(
  {
    ...base,
    acao: "editar-nome-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80) }),
    capturarAntes: (i) => prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id }, select: { disciplinaCatalogoId: true } });
    if (!existe) throw new ActionError("Sub-disciplina não encontrada.");
    const conflito = await prisma.subdisciplinaCatalogo.findFirst({
      where: { disciplinaCatalogoId: existe.disciplinaCatalogoId, nome: i.nome, id: { not: i.id } },
      select: { id: true },
    });
    if (conflito) throw new ActionError(`"${i.nome}" já existe neste card.`);
    await prisma.subdisciplinaCatalogo.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

/** Exclusão definitiva — bloqueada se algum documento já apontar para esta sub (arquive em vez disso). */
export const excluirSubdisciplina = defineAction(
  {
    ...base,
    acao: "excluir-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    const uso = await prisma.documentoDisciplina.count({ where: { subdisciplinaId: i.id } });
    if (uso > 0) throw new ActionError(fraseSubEmUso(uso));
    await prisma.subdisciplinaCatalogo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/**
 * Arquivar/desarquivar uma sub pela lente Todas (E8): mexe só em `ativo` — nome, validade e siglas
 * ficam como estão (a faixa muda na lente da versão, A2).
 */
export const definirAtivoSubdisciplina = defineAction(
  {
    ...base,
    acao: "definir-ativo-subdisciplina",
    entidade: "SubdisciplinaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    capturarAntes: (i) => prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.subdisciplinaCatalogo.findUnique({ where: { id: i.id }, select: { id: true } });
    if (!existe) throw new ActionError("Sub-disciplina não encontrada.");
    await prisma.subdisciplinaCatalogo.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);
