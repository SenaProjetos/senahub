"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { chaveDoNome, fasesValidas, motivoNaoExcluir, MOTIVO_SEM_FASE, reordenar, validarNome } from "./regras";

/**
 * Cadastro de Tipos de empreendimento (Configurações → Tipos de empreendimento): nome, etapas em que a disciplina
 * nasce, ativo, ordem. Mesma permissão de quem cadastra projeto (`projetos:gerir`) — o tipo classifica o projeto.
 * Mexer aqui só vale para disciplinas criadas DEPOIS: as que já existem não ganham nem perdem etapa.
 */
const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir", entidade: "TipoEmpreendimento" } as const;
const rev = () => {
  revalidatePath("/configuracoes/tipos-empreendimento");
  revalidatePath("/projetos");
};

async function idsDasFasesAtivas(): Promise<Set<string>> {
  const fases = await prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    select: { id: true },
  });
  return new Set(fases.map((f) => f.id));
}

async function exigirNomeLivre(nome: string, ignorarId?: string) {
  const chave = chaveDoNome(nome);
  const todos = await prisma.tipoEmpreendimento.findMany({ select: { id: true, nome: true } });
  if (todos.some((t) => t.id !== ignorarId && chaveDoNome(t.nome) === chave)) {
    throw new ActionError("Já existe um tipo de empreendimento com esse nome.");
  }
}

export const salvarTipoEmpreendimento = defineAction(
  {
    ...base,
    acao: "salvar-tipo-empreendimento",
    schema: z.object({
      id: z.string().min(1).optional(),
      nome: z.string(),
      etapasPadraoIds: z.array(z.string()),
    }),
    capturarAntes: async (i) => (i.id ? await prisma.tipoEmpreendimento.findUnique({ where: { id: i.id } }) : null),
    entidadeId: (d, i) => i.id ?? (d as { id: string }).id,
  },
  async (i) => {
    const erroNome = validarNome(i.nome);
    if (erroNome) throw new ActionError(erroNome);
    const nome = i.nome.trim().replace(/\s+/g, " ");
    await exigirNomeLivre(nome, i.id);
    const etapas = fasesValidas(i.etapasPadraoIds, await idsDasFasesAtivas());
    if (etapas.length === 0) throw new ActionError(MOTIVO_SEM_FASE);

    if (i.id) {
      const existe = await prisma.tipoEmpreendimento.findUnique({ where: { id: i.id }, select: { id: true } });
      if (!existe) throw new ActionError("Tipo de empreendimento não encontrado.");
      await prisma.tipoEmpreendimento.update({ where: { id: i.id }, data: { nome, etapasPadraoIds: etapas } });
      rev();
      return { id: i.id };
    }
    const max = await prisma.tipoEmpreendimento.aggregate({ _max: { ordem: true } });
    const criado = await prisma.tipoEmpreendimento.create({
      data: { nome, etapasPadraoIds: etapas, ordem: (max._max.ordem ?? -1) + 1 },
      select: { id: true },
    });
    rev();
    return { id: criado.id };
  },
);

export const alternarTipoEmpreendimento = defineAction(
  {
    ...base,
    acao: "alternar-tipo-empreendimento",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    capturarAntes: (i) => prisma.tipoEmpreendimento.findUnique({ where: { id: i.id }, select: { ativo: true } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i) => {
    const r = await prisma.tipoEmpreendimento.updateMany({ where: { id: i.id }, data: { ativo: i.ativo } });
    if (r.count !== 1) throw new ActionError("Tipo de empreendimento não encontrado.");
    rev();
    return { id: i.id };
  },
);

export const moverTipoEmpreendimento = defineAction(
  {
    ...base,
    acao: "mover-tipo-empreendimento",
    schema: z.object({ id: z.string().min(1), direcao: z.enum(["cima", "baixo"]) }),
    entidadeId: (_d, i) => i.id,
  },
  async (i) => {
    const atual = await prisma.tipoEmpreendimento.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true } });
    const novo = reordenar(atual, i.id, i.direcao);
    if (!novo) return { id: i.id }; // já está na ponta: nada a fazer, sem erro
    await prisma.$transaction(
      novo.map((t) => prisma.tipoEmpreendimento.update({ where: { id: t.id }, data: { ordem: t.ordem } })),
    );
    rev();
    return { id: i.id };
  },
);

export const excluirTipoEmpreendimento = defineAction(
  {
    ...base,
    acao: "excluir-tipo-empreendimento",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: (i) => prisma.tipoEmpreendimento.findUnique({ where: { id: i.id } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i) => {
    const t = await prisma.tipoEmpreendimento.findUnique({
      where: { id: i.id },
      select: { _count: { select: { projetos: true, negociacoes: true, modelosEap: true } } },
    });
    if (!t) throw new ActionError("Tipo de empreendimento não encontrado.");
    const motivo = motivoNaoExcluir({ projetos: t._count.projetos, negociacoes: t._count.negociacoes, modelos: t._count.modelosEap });
    if (motivo) throw new ActionError(motivo);
    await prisma.tipoEmpreendimento.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
