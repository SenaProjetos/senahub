"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { aplicarOcultos, calcularStatusBriefing } from "@/modules/inputs/briefing-schema";
import { problemasDeEvolucao, validarEsquema } from "@/modules/inputs/modelo-schema";
import { resolverModelo } from "@/modules/inputs/modelo-queries";

const cfg = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir", entidade: "ModeloBriefing" } as const;

const nomeSchema = z.string().trim().min(1, "Dê um nome ao modelo.").max(80, "Use até 80 caracteres no nome.");
const descricaoSchema = z.string().trim().max(400, "Use até 400 caracteres na descrição.").optional();

const modeloAntes = (i: { id: string }) => prisma.modeloBriefing.findUnique({ where: { id: i.id } });

function ehConflitoDeNome(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

const NOME_REPETIDO = "Já existe um modelo com este nome.";

/** Cria um modelo: em branco (uma seção vazia) ou cópia de outro, com as MESMAS chaves de pergunta. */
export const criarModeloBriefing = defineAction(
  {
    ...cfg,
    acao: "criar-modelo-briefing",
    schema: z.object({ nome: nomeSchema, descricao: descricaoSchema, copiarDeId: z.string().min(1).optional() }),
    entidadeId: (d) => (d as { id?: string } | undefined)?.id,
  },
  async (input) => {
    const origem = input.copiarDeId ? await resolverModelo(input.copiarDeId) : null;
    if (input.copiarDeId && origem?.id !== input.copiarDeId) throw new ActionError("Modelo de origem não encontrado.");
    const esquema = origem
      ? origem.secoes
      : [{ id: "geral", titulo: "Informações gerais", campos: [] as unknown[] }];
    try {
      const m = await prisma.modeloBriefing.create({
        data: { nome: input.nome, descricao: input.descricao || null, esquema: esquema as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      revalidatePath("/configuracoes/inputs/modelos");
      return { id: m.id };
    } catch (e) {
      if (ehConflitoDeNome(e)) throw new ActionError(NOME_REPETIDO);
      throw e;
    }
  },
);

/**
 * Salva o modelo INTEIRO (nome, descrição e esquema). A trava otimista por `versao` recusa quem
 * salvou em cima de uma versão que já mudou; o esquema passa por `validarEsquema` e pela regra de
 * evolução (pergunta existente não muda de grupo de tipo).
 */
export const salvarModeloBriefing = defineAction(
  {
    ...cfg,
    acao: "salvar-modelo-briefing",
    schema: z.object({
      id: z.string().min(1),
      versao: z.number().int().min(1),
      nome: nomeSchema,
      descricao: descricaoSchema,
      esquema: z.array(z.unknown()),
    }),
    entidadeId: (_d, i) => (i as { id: string }).id,
    capturarAntes: modeloAntes,
  },
  async (input) => {
    const v = validarEsquema(input.esquema);
    if (!v.ok) throw new ActionError(v.erro);
    const atual = await prisma.modeloBriefing.findUnique({ where: { id: input.id } });
    if (!atual) throw new ActionError("Modelo não encontrado.");
    const antes = validarEsquema(atual.esquema);
    const problemas = problemasDeEvolucao(antes.ok ? antes.esquema : null, v.esquema);
    if (problemas.length > 0) throw new ActionError(problemas[0]);
    try {
      const { count } = await prisma.modeloBriefing.updateMany({
        where: { id: input.id, versao: input.versao },
        data: {
          nome: input.nome,
          descricao: input.descricao || null,
          esquema: v.esquema as unknown as Prisma.InputJsonValue,
          versao: { increment: 1 },
        },
      });
      if (count !== 1) throw new ActionError("Outra pessoa salvou este modelo enquanto você editava. Recarregue a página e refaça a alteração.");
    } catch (e) {
      if (ehConflitoDeNome(e)) throw new ActionError(NOME_REPETIDO);
      throw e;
    }
    revalidatePath("/configuracoes/inputs/modelos");
    revalidatePath(`/configuracoes/inputs/modelos/${input.id}`);
    return { id: input.id, versao: input.versao + 1 };
  },
);

/** Torna um modelo o padrão (o dos projetos que não escolheram outro). */
export const definirModeloPadraoBriefing = defineAction(
  {
    ...cfg,
    acao: "definir-modelo-padrao-briefing",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (_d, i) => (i as { id: string }).id,
    capturarAntes: () => prisma.modeloBriefing.findFirst({ where: { padrao: true }, select: { id: true, nome: true } }),
  },
  async (input) => {
    try {
      await prisma.$transaction(async (tx) => {
        const alvo = await tx.modeloBriefing.findUnique({ where: { id: input.id }, select: { ativo: true, padrao: true } });
        if (!alvo) throw new ActionError("Modelo não encontrado.");
        if (!alvo.ativo) throw new ActionError("Restaure o modelo antes de torná-lo o padrão.");
        if (alvo.padrao) return;
        await tx.modeloBriefing.updateMany({ where: { padrao: true }, data: { padrao: false } });
        await tx.modeloBriefing.update({ where: { id: input.id }, data: { padrao: true } });
      });
    } catch (e) {
      if (ehConflitoDeNome(e)) throw new ActionError("Outra pessoa trocou o modelo padrão agora. Tente de novo.");
      throw e;
    }
    revalidatePath("/configuracoes/inputs/modelos");
    return { id: input.id };
  },
);

/** Arquiva (some da escolha; projetos que o usam seguem nele) ou restaura. O padrão não arquiva. */
export const arquivarModeloBriefing = defineAction(
  {
    ...cfg,
    acao: "arquivar-modelo-briefing",
    schema: z.object({ id: z.string().min(1), arquivar: z.boolean() }),
    entidadeId: (_d, i) => (i as { id: string }).id,
    capturarAntes: modeloAntes,
  },
  async (input) => {
    const { count } = await prisma.modeloBriefing.updateMany({
      where: { id: input.id, ...(input.arquivar ? { padrao: false, ativo: true } : { ativo: false }) },
      data: { ativo: !input.arquivar },
    });
    if (count !== 1) {
      const m = await prisma.modeloBriefing.findUnique({ where: { id: input.id }, select: { padrao: true, ativo: true } });
      if (!m) throw new ActionError("Modelo não encontrado.");
      if (input.arquivar && m.padrao) throw new ActionError("O modelo padrão não pode ser arquivado. Torne outro modelo o padrão antes.");
      throw new ActionError(input.arquivar ? "Este modelo já está arquivado." : "Este modelo já está ativo.");
    }
    revalidatePath("/configuracoes/inputs/modelos");
    return { id: input.id };
  },
);

/**
 * Escolhe o modelo de formulário DESTE projeto. As ocultações (feitas sobre o modelo anterior)
 * são zeradas, o status é recalculado no modelo novo e as respostas ficam: pergunta de mesma chave
 * aproveita a resposta, a que não existe no modelo novo fica guardada fora da tela.
 */
export const definirModeloDoProjeto = defineAction(
  {
    modulo: "projetos",
    acao: "definir-modelo-briefing",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "BriefingProjeto",
    schema: z.object({ projetoId: z.string().min(1), modeloId: z.string().min(1) }),
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: (i) =>
      prisma.briefingProjeto.findUnique({
        where: { projetoId: i.projetoId },
        select: { modeloId: true, secoesOcultas: true, camposOcultos: true, status: true },
      }),
  },
  async (input, { user }) => {
    if (!(await projetoVisivel(user, input.projetoId))) throw new ActionError("Projeto não encontrado.");
    const status = await prisma.$transaction(async (tx) => {
      const novo = await tx.modeloBriefing.findUnique({ where: { id: input.modeloId }, select: { id: true, ativo: true } });
      if (!novo) throw new ActionError("Modelo não encontrado.");
      await tx.briefingProjeto.createMany({ data: [{ projetoId: input.projetoId }], skipDuplicates: true });
      await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "projetoId" = ${input.projetoId} FOR UPDATE`;
      const atual = await tx.briefingProjeto.findUniqueOrThrow({
        where: { projetoId: input.projetoId },
        select: { respostasJson: true, modeloId: true, status: true, secoesOcultas: true, camposOcultos: true },
      });
      const efetivo = (await resolverModelo(atual.modeloId, tx)).id;
      if (efetivo === input.modeloId) return atual.status;
      if (!novo.ativo) throw new ActionError("Este modelo está arquivado. Restaure-o em Configurações para usá-lo.");
      const modelo = await resolverModelo(input.modeloId, tx);
      const novoStatus = calcularStatusBriefing(
        (atual.respostasJson ?? {}) as Record<string, unknown>,
        aplicarOcultos(modelo.secoes, { secoes: [], campos: [] }),
      );
      await tx.briefingProjeto.update({
        where: { projetoId: input.projetoId },
        data: { modeloId: input.modeloId, secoesOcultas: [], camposOcultos: [], status: novoStatus },
      });
      return novoStatus;
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, status };
  },
);
