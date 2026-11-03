"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { calcularStatusBriefing, secoesDoProjeto } from "@/modules/inputs/briefing-schema";
import { formulariosEfetivos, recalcularBriefingsDosProjetos } from "@/modules/inputs/briefing-status";
import { renomeioSchema } from "@/modules/inputs/modelo-schema";
import { NOME_REPETIDO, ehConflitoDeNome, salvarModeloNoBanco } from "@/modules/inputs/modelo-service";
import { resolverModelo, resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";

const cfg = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir", entidade: "ModeloBriefing" } as const;

const nomeSchema = z.string("Informe o nome do modelo.").trim().min(1, "Dê um nome ao modelo.").max(80, "Use até 80 caracteres no nome.");
const descricaoSchema = z.string("Descrição inválida.").trim().max(400, "Use até 400 caracteres na descrição.").optional();

const idModelo = z.string("Modelo inválido.").min(1, "Modelo inválido.");

const modeloAntes = (i: { id: string }) => prisma.modeloBriefing.findUnique({ where: { id: i.id } });

const ESQUEMA_ILEGIVEL = "Este modelo está com o formulário ilegível. Abra-o em Configurações → Modelos de formulário e salve-o de novo.";

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
      /** Opções renomeadas no editor: as respostas já gravadas acompanham o novo texto (na mesma transação). */
      renomeios: z.array(renomeioSchema, "Alterações de opção inválidas.").max(400, "Alterações de opção demais de uma vez.").default([]),
    }),
    entidadeId: (_d, i) => (i as { id: string }).id,
    capturarAntes: modeloAntes,
  },
  async (input) => {
    const r = await salvarModeloNoBanco(input);
    revalidatePath("/configuracoes/inputs/modelos");
    revalidatePath(`/configuracoes/inputs/modelos/${input.id}`);
    return { id: input.id, versao: r.versao, migradas: r.migradas };
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
    let projetosAfetados = 0;
    try {
      await prisma.$transaction(async (tx) => {
        const alvo = await tx.modeloBriefing.findUnique({ where: { id: input.id }, select: { ativo: true, padrao: true } });
        if (!alvo) throw new ActionError("Modelo não encontrado.");
        if (!alvo.ativo) throw new ActionError("Restaure o modelo antes de torná-lo o padrão.");
        if (alvo.padrao) return;
        // Esquema ilegível cairia no formulário embutido e zeraria as ocultações de quem herda o padrão por nada.
        if ((await resolverModelo(input.id, tx)).invalido) throw new ActionError(ESQUEMA_ILEGIVEL);
        // Quem não escolheu modelo (nem o cliente) passa a usar o novo padrão: foto do formulário de cada um ANTES da troca.
        const herdeiros = await tx.briefingProjeto.findMany({
          where: { modeloId: null, projeto: { cliente: { modeloBriefingId: null } } },
          select: { projetoId: true },
        });
        const projetoIds = herdeiros.map((h) => h.projetoId);
        const antes = await formulariosEfetivos(tx, projetoIds);
        await tx.modeloBriefing.updateMany({ where: { padrao: true }, data: { padrao: false } });
        // Condicionado ao estado lido: arquivar ao mesmo tempo não deixa um padrão arquivado (o throw desfaz tudo).
        const { count } = await tx.modeloBriefing.updateMany({ where: { id: input.id, ativo: true }, data: { padrao: true } });
        if (count !== 1) throw new ActionError("Restaure o modelo antes de torná-lo o padrão.");
        // Mesma regra de trocar o modelo do projeto ou do cliente: o formulário efetivo mudou, as ocultações (feitas sobre o
        // anterior) zeram e o status é recalculado; as respostas ficam.
        projetosAfetados = await recalcularBriefingsDosProjetos(tx, projetoIds, antes);
      }, { timeout: 30_000 });
    } catch (e) {
      if (ehConflitoDeNome(e)) throw new ActionError("Outra pessoa trocou o modelo padrão agora. Tente de novo.");
      throw e;
    }
    revalidatePath("/configuracoes/inputs/modelos");
    // Quantos briefings mudaram de status ou perderam ocultações: fica no registro da auditoria.
    return { id: input.id, projetosAfetados };
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
 * Escolhe o modelo de formulário padrão de um CLIENTE (ou volta ao padrão do sistema com `modeloId: null`). Os projetos
 * dele que não escolheram modelo passam a seguir este: o status dos briefings é recalculado e as respostas ficam
 * (pergunta de mesma chave aproveita a resposta).
 */
export const definirModeloDoCliente = defineAction(
  {
    modulo: "clientes",
    acao: "definir-modelo-briefing-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: z.object({
      clienteId: z.string("Cliente inválido.").min(1, "Cliente inválido."),
      modeloId: z.string("Modelo inválido.").min(1, "Modelo inválido.").nullable(),
    }),
    entidadeId: (_d, i) => (i as { clienteId: string }).clienteId,
    capturarAntes: (i) => prisma.cliente.findUnique({ where: { id: i.clienteId }, select: { modeloBriefingId: true } }),
  },
  async (input) => {
    const afetados = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id: input.clienteId },
        select: { id: true, modeloBriefingId: true, excluidoEm: true, fundidoEmId: true },
      });
      // `findUnique` não passa pelo filtro de soft delete: cliente excluído ou fundido não recebe formulário novo.
      if (!cliente || cliente.excluidoEm || cliente.fundidoEmId) throw new ActionError("Cliente não encontrado.");
      if (cliente.modeloBriefingId === input.modeloId) return 0;
      if (input.modeloId) {
        const novo = await tx.modeloBriefing.findUnique({ where: { id: input.modeloId }, select: { ativo: true } });
        if (!novo) throw new ActionError("Modelo não encontrado.");
        // Quem já usa um modelo arquivado segue nele; escolher um arquivado de novo é que não vale.
        if (!novo.ativo && cliente.modeloBriefingId !== input.modeloId) throw new ActionError("Este modelo está arquivado. Restaure-o em Configurações para usá-lo.");
        if ((await resolverModelo(input.modeloId, tx)).invalido) throw new ActionError(ESQUEMA_ILEGIVEL);
      }
      // Os projetos sem modelo próprio herdam do cliente: foto do formulário de cada um antes e recálculo depois — só quando
      // o formulário efetivo MUDA as ocultações (feitas sobre o anterior) zeram.
      const alvo = await tx.briefingProjeto.findMany({ where: { modeloId: null, projeto: { clienteId: input.clienteId } }, select: { projetoId: true }, orderBy: { id: "asc" } });
      const projetoIds = alvo.map((b) => b.projetoId);
      const antes = await formulariosEfetivos(tx, projetoIds);
      await tx.cliente.update({ where: { id: input.clienteId }, data: { modeloBriefingId: input.modeloId } });
      await recalcularBriefingsDosProjetos(tx, projetoIds, antes);
      return projetoIds.length;
    }, { timeout: 30_000 });
    revalidatePath(`/clientes/${input.clienteId}`);
    revalidatePath("/configuracoes/inputs/modelos");
    return { clienteId: input.clienteId, projetosAfetados: afetados };
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
      const efetivo = (await resolverModeloDoProjeto(input.projetoId, atual.modeloId, tx)).id;
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
      const disciplinas = (await tx.disciplina.findMany({ where: { projetoId: input.projetoId }, select: { disciplinaTextoLegado: true } })).map((d) => d.disciplinaTextoLegado);
      const novoStatus = calcularStatusBriefing(
        (atual.respostasJson ?? {}) as Record<string, unknown>,
        secoesDoProjeto(modelo.secoes, disciplinas, { secoes: [], campos: [] }),
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
