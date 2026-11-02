"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { aplicarOcultos, calcularStatusBriefing, type SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { problemasDeEvolucao, validarEsquema } from "@/modules/inputs/modelo-schema";
import { resolverModelo } from "@/modules/inputs/modelo-queries";

const cfg = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir", entidade: "ModeloBriefing" } as const;

const nomeSchema = z.string("Informe o nome do modelo.").trim().min(1, "Dê um nome ao modelo.").max(80, "Use até 80 caracteres no nome.");
const descricaoSchema = z.string("Descrição inválida.").trim().max(400, "Use até 400 caracteres na descrição.").optional();

const idModelo = z.string("Modelo inválido.").min(1, "Modelo inválido.");

const modeloAntes = (i: { id: string }) => prisma.modeloBriefing.findUnique({ where: { id: i.id } });

function ehConflitoDeNome(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

const NOME_REPETIDO = "Já existe um modelo com este nome.";
const ESQUEMA_ILEGIVEL = "Este modelo está com o formulário ilegível. Abra-o em Configurações → Modelos de formulário e salve-o de novo.";

/**
 * O status do briefing é persistido para a listagem; quando o formulário muda (obrigatória nova,
 * pergunta removida, outro modelo padrão), recalcula o dos briefings que o usam. Sem trava de
 * linha de propósito: o próximo salvamento do briefing corrige qualquer corrida.
 */
async function recalcularStatusDoModelo(modeloId: string, ehPadrao: boolean, secoes: readonly SecaoBriefing[]) {
  const briefings = await prisma.briefingProjeto.findMany({
    where: ehPadrao ? { OR: [{ modeloId }, { modeloId: null }] } : { modeloId },
    select: { id: true, status: true, respostasJson: true, secoesOcultas: true, camposOcultos: true },
  });
  for (const b of briefings) {
    const novo = calcularStatusBriefing(
      (b.respostasJson ?? {}) as Record<string, unknown>,
      aplicarOcultos(secoes, { secoes: b.secoesOcultas, campos: b.camposOcultos }),
    );
    if (novo !== b.status) await prisma.briefingProjeto.update({ where: { id: b.id }, data: { status: novo } });
  }
}

/** Cria um modelo: em branco (uma seção vazia) ou cópia de outro, com as MESMAS chaves de pergunta. */
export const criarModeloBriefing = defineAction(
  {
    ...cfg,
    acao: "criar-modelo-briefing",
    schema: z.object({ nome: nomeSchema, descricao: descricaoSchema, copiarDeId: z.string("Modelo de origem inválido.").min(1, "Modelo de origem inválido.").optional() }),
    entidadeId: (d) => (d as { id?: string } | undefined)?.id,
  },
  async (input) => {
    const origem = input.copiarDeId ? await resolverModelo(input.copiarDeId) : null;
    if (input.copiarDeId && (origem?.id !== input.copiarDeId || origem.invalido)) {
      const existe = await prisma.modeloBriefing.findUnique({ where: { id: input.copiarDeId }, select: { id: true } });
      throw new ActionError(existe ? ESQUEMA_ILEGIVEL : "Modelo de origem não encontrado.");
    }
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
      id: idModelo,
      versao: z.number("Versão inválida.").int("Versão inválida.").min(1, "Versão inválida."),
      nome: nomeSchema,
      descricao: descricaoSchema,
      esquema: z.array(z.unknown(), "Formulário inválido."),
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
    await recalcularStatusDoModelo(input.id, atual.padrao, v.esquema);
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
    schema: z.object({ id: idModelo }),
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
        // Condicionado ao estado lido: arquivar ao mesmo tempo não deixa um padrão arquivado (o throw desfaz tudo).
        const { count } = await tx.modeloBriefing.updateMany({ where: { id: input.id, ativo: true }, data: { padrao: true } });
        if (count !== 1) throw new ActionError("Restaure o modelo antes de torná-lo o padrão.");
      });
    } catch (e) {
      if (ehConflitoDeNome(e)) throw new ActionError("Outra pessoa trocou o modelo padrão agora. Tente de novo.");
      throw e;
    }
    // Quem não escolheu modelo passa a usar o novo padrão: o status deles muda junto.
    const novo = await resolverModelo(input.id);
    if (!novo.invalido) await recalcularStatusDoModelo(input.id, true, novo.secoes);
    revalidatePath("/configuracoes/inputs/modelos");
    return { id: input.id };
  },
);

/** Arquiva (some da escolha; projetos que o usam seguem nele) ou restaura. O padrão não arquiva. */
export const arquivarModeloBriefing = defineAction(
  {
    ...cfg,
    acao: "arquivar-modelo-briefing",
    schema: z.object({ id: idModelo, arquivar: z.boolean("Ação inválida.") }),
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
    schema: z.object({ projetoId: z.string("Projeto inválido.").min(1, "Projeto inválido."), modeloId: idModelo }),
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
      if (efetivo === input.modeloId) {
        // Escolher explicitamente o modelo que já vale por ser o padrão: passa a ser a escolha do projeto
        // (não muda de formulário se o padrão mudar depois). Nada mais muda.
        if (atual.modeloId === null) {
          await tx.briefingProjeto.update({ where: { projetoId: input.projetoId }, data: { modeloId: input.modeloId } });
        }
        return atual.status;
      }
      if (!novo.ativo) throw new ActionError("Este modelo está arquivado. Restaure-o em Configurações para usá-lo.");
      const modelo = await resolverModelo(input.modeloId, tx);
      if (modelo.invalido) throw new ActionError(ESQUEMA_ILEGIVEL);
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
