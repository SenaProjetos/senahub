"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import {
  aplicarOcultos,
  BRIEFING_SCHEMA,
  calcularStatusBriefing,
  existeNoBriefing,
} from "@/modules/inputs/briefing-schema";
import { gravarRespostasBriefing } from "@/modules/inputs/briefing-service";
import { perguntasDoPadraoParaCriar } from "@/modules/inputs/perguntas";
import {
  adicionarInputSchema,
  editarInputSchema,
  removerInputSchema,
  responderInputsSchema,
  gerarLinkSchema,
  atualizarLinkSchema,
  visibilidadeBriefingSchema,
} from "@/modules/inputs/schemas";

const projBase = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

async function exigirProjetoVisivel(
  user: Pick<SessionUser, "id" | "superUsuario" | "escopoGlobalPerfil" | "tipo">,
  projetoId: string,
) {
  if (!(await projetoVisivel(user, projetoId))) throw new ActionError("Projeto não encontrado.");
}

/** A pergunta do projeto (ativa ou removida) — `capturarAntes` e a mensagem certa quando a escrita não casa. */
const perguntaDoProjeto = (i: { id: string; projetoId: string }) =>
  prisma.inputProjeto.findFirst({ where: { id: i.id, projetoId: i.projetoId } });

/** Mensagem para a escrita condicionada que não casou: a pergunta não existe ou mudou de estado. */
async function motivoNaoCasou(i: { id: string; projetoId: string }, seRemovida: string, seAtiva: string) {
  const atual = await perguntaDoProjeto(i);
  if (!atual) return "Pergunta não encontrada.";
  return atual.removidoEm ? seRemovida : seAtiva;
}

/**
 * Cria, no projeto, os inputs padrão (InputTemplate) das disciplinas dele — sem duplicar e sem
 * ressuscitar: pergunta que veio do padrão e foi editada ou removida não volta.
 */
async function aplicarInputsPadraoCore(projetoId: string): Promise<number> {
  const [proj, existentes, templates] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { disciplinas: { select: { disciplinaTextoLegado: true } } } }),
    // Ativas E removidas: as duas impedem o padrão de recriar a pergunta.
    prisma.inputProjeto.findMany({ where: { projetoId }, select: { templateId: true, disciplina: true, pergunta: true } }),
    prisma.inputTemplate.findMany({ where: { ativo: true }, orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] }),
  ]);
  if (!proj) return 0;
  const novos = perguntasDoPadraoParaCriar(
    templates,
    existentes,
    proj.disciplinas.map((d) => d.disciplinaTextoLegado),
  );
  if (novos.length === 0) return 0;
  // Único (projetoId, templateId): dois "Aplicar padrão" simultâneos não duplicam.
  const { count } = await prisma.inputProjeto.createMany({
    data: novos.map((t) => ({ projetoId, disciplina: t.disciplina, pergunta: t.pergunta, ordem: t.ordem, templateId: t.id })),
    skipDuplicates: true,
  });
  return count;
}

export const adicionarInput = defineAction(
  {
    modulo: "projetos",
    acao: "adicionar-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: adicionarInputSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const ordem = await prisma.inputProjeto.count({ where: { projetoId: input.projetoId } });
    const item = await prisma.inputProjeto.create({
      data: {
        projetoId: input.projetoId,
        disciplina: input.disciplina || null,
        pergunta: input.pergunta,
        ordem,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: item.id };
  },
);

/** Edita o texto e a disciplina de uma pergunta ativa. A resposta fica como está. */
export const editarInput = defineAction(
  {
    modulo: "projetos",
    acao: "editar-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: editarInputSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: perguntaDoProjeto,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const { count } = await prisma.inputProjeto.updateMany({
      where: { id: input.id, projetoId: input.projetoId, removidoEm: null },
      data: { pergunta: input.pergunta, disciplina: input.disciplina || null },
    });
    if (count !== 1) {
      throw new ActionError(await motivoNaoCasou(input, "Esta pergunta foi removida. Restaure-a para editar.", "Não foi possível editar a pergunta."));
    }
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: input.id };
  },
);

/**
 * Tira a pergunta do formulário (tela e link). A linha e a resposta ficam: restaurar devolve
 * as duas, e o padrão não recria a pergunta.
 */
export const removerInput = defineAction(
  {
    modulo: "projetos",
    acao: "remover-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: removerInputSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: perguntaDoProjeto,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const { count } = await prisma.inputProjeto.updateMany({
      where: { id: input.id, projetoId: input.projetoId, removidoEm: null },
      data: { removidoEm: new Date() },
    });
    if (count !== 1) {
      throw new ActionError(await motivoNaoCasou(input, "Esta pergunta já foi removida.", "Não foi possível remover a pergunta."));
    }
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: input.id, projetoId: input.projetoId };
  },
);

/** Devolve ao formulário uma pergunta removida, com a resposta que ela tinha. */
export const restaurarInput = defineAction(
  {
    modulo: "projetos",
    acao: "restaurar-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: removerInputSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: perguntaDoProjeto,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const { count } = await prisma.inputProjeto.updateMany({
      where: { id: input.id, projetoId: input.projetoId, removidoEm: { not: null } },
      data: { removidoEm: null },
    });
    if (count !== 1) {
      throw new ActionError(await motivoNaoCasou(input, "Não foi possível restaurar a pergunta.", "Esta pergunta já está no formulário."));
    }
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: input.id, projetoId: input.projetoId };
  },
);

/** Admin edita respostas após o preenchimento do cliente. */
export const responderInputs = defineAction(
  {
    modulo: "projetos",
    acao: "responder-inputs",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: responderInputsSchema,
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    // Só perguntas ATIVAS deste projeto: id de outro projeto ou pergunta removida não é gravado,
    // e a tela avisa quantas ficaram de fora (removidas por outra pessoa enquanto editava).
    const gravadas = await prisma.$transaction(
      input.respostas.map((r) =>
        prisma.inputProjeto.updateMany({
          where: { id: r.id, projetoId: input.projetoId, removidoEm: null },
          data: { resposta: r.resposta || null },
        }),
      ),
    );
    const salvas = gravadas.reduce((n, g) => n + g.count, 0);
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, salvas, ignoradas: input.respostas.length - salvas };
  },
);

/** Salva (upsert) as respostas do briefing de Start e recalcula o status. */
export const salvarBriefing = defineAction(
  {
    modulo: "projetos",
    acao: "salvar-briefing",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "BriefingProjeto",
    schema: z.object({
      projetoId: z.string().min(1),
      respostas: z.record(z.string(), z.unknown()).default({}),
    }),
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    // Só o e-mail/telefone que MUDOU é validado; o inválido já gravado segue salvando.
    const r = await gravarRespostasBriefing(input.projetoId, input.respostas, user.name);
    if (!r.ok) throw new ActionError(r.erro, r.campos);
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, status: r.status };
  },
);

/**
 * Oculta (ou mostra de novo) uma seção ou um campo do briefing NESTE projeto. As respostas
 * ficam guardadas; o status é recalculado sobre o que continua visível.
 */
export const definirVisibilidadeBriefing = defineAction(
  {
    modulo: "projetos",
    acao: "visibilidade-briefing",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "BriefingProjeto",
    schema: visibilidadeBriefingSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: (i) =>
      prisma.briefingProjeto.findUnique({
        where: { projetoId: i.projetoId },
        select: { secoesOcultas: true, camposOcultos: true, status: true },
      }),
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    if (!existeNoBriefing(input.alvo, input.chave)) throw new ActionError("Pergunta do briefing não encontrada.");
    const status = await prisma.$transaction(async (tx) => {
      // A linha pode não existir (briefing nunca preenchido). Depois de garantida, a trava
      // serializa dois cliques simultâneos — sem ela, um sobrescreveria a lista do outro.
      await tx.briefingProjeto.createMany({ data: [{ projetoId: input.projetoId }], skipDuplicates: true });
      await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "projetoId" = ${input.projetoId} FOR UPDATE`;
      const atual = await tx.briefingProjeto.findUniqueOrThrow({
        where: { projetoId: input.projetoId },
        select: { respostasJson: true, secoesOcultas: true, camposOcultos: true },
      });
      const lista = input.alvo === "secao" ? atual.secoesOcultas : atual.camposOcultos;
      const nova = input.oculto ? [...new Set([...lista, input.chave])] : lista.filter((c) => c !== input.chave);
      const ocultos = {
        secoes: input.alvo === "secao" ? nova : atual.secoesOcultas,
        campos: input.alvo === "campo" ? nova : atual.camposOcultos,
      };
      const novoStatus = calcularStatusBriefing(
        (atual.respostasJson ?? {}) as Record<string, unknown>,
        aplicarOcultos(BRIEFING_SCHEMA, ocultos),
      );
      await tx.briefingProjeto.update({
        where: { projetoId: input.projetoId },
        data: { secoesOcultas: ocultos.secoes, camposOcultos: ocultos.campos, status: novoStatus },
      });
      return novoStatus;
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, status };
  },
);

/**
 * Gera (ou regenera) o link público de inputs do projeto. Ao regerar, troca SÓ o
 * token e preserva estado e validade (mesma regra de `gerarLinkArquivos`): o
 * endereço antigo morre na hora, e um link revogado continua revogado — reativar
 * é decisão explícita no `atualizarLinkInput`.
 */
export const gerarLinkInput = defineAction(
  {
    modulo: "projetos",
    acao: "gerar-link-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "LinkPublicoInput",
    schema: gerarLinkSchema,
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
    capturarAntes: (i) => prisma.linkPublicoInput.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    // Garante que os inputs padrão das disciplinas estejam no projeto antes de liberar o link.
    await aplicarInputsPadraoCore(input.projetoId);
    const token = randomBytes(18).toString("hex");
    await prisma.linkPublicoInput.upsert({
      where: { projetoId: input.projetoId },
      create: { projetoId: input.projetoId, token, ativo: true },
      update: { token },
    });
    revalidatePath(`/projetos/${input.projetoId}/inputs`);
    return { projetoId: input.projetoId, token };
  },
);

/** Revoga (ou reativa) e define a validade do link público de inputs. */
export const atualizarLinkInput = defineAction(
  {
    modulo: "projetos",
    acao: "atualizar-link-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "LinkPublicoInput",
    schema: atualizarLinkSchema,
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
    capturarAntes: (i) => prisma.linkPublicoInput.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const link = await prisma.linkPublicoInput.findUnique({ where: { projetoId: input.projetoId } });
    if (!link) throw new ActionError("Gere o link público antes de configurá-lo.");
    await prisma.linkPublicoInput.update({
      where: { projetoId: input.projetoId },
      data: {
        ativo: input.ativo,
        expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}/inputs`);
    return { projetoId: input.projetoId };
  },
);

// ── Inputs padrão por disciplina (#3) ─────────────────────────
export const aplicarInputsPadrao = defineAction(
  { ...projBase, acao: "aplicar-inputs-padrao", entidade: "InputProjeto", schema: z.object({ projetoId: z.string().min(1) }), entidadeId: (_d, i) => (i as { projetoId: string }).projetoId },
  async (i, { user }) => {
    await exigirProjetoVisivel(user, i.projetoId);
    const criados = await aplicarInputsPadraoCore(i.projetoId);
    revalidatePath(`/projetos/${i.projetoId}`);
    return { criados };
  },
);

const templateSchema = z.object({
  disciplina: opt(z.string()),
  pergunta: z.string().min(1, "Informe a pergunta."),
  ordem: z.number().int().min(0).optional(),
});

export const criarInputTemplate = defineAction(
  { ...projBase, acao: "criar-input-template", entidade: "InputTemplate", schema: templateSchema },
  async (i) => {
    const t = await prisma.inputTemplate.create({
      data: { disciplina: i.disciplina || null, pergunta: i.pergunta, ordem: i.ordem ?? 0 },
    });
    revalidatePath("/configuracoes/inputs");
    return { id: t.id };
  },
);

export const editarInputTemplate = defineAction(
  { ...projBase, acao: "editar-input-template", entidade: "InputTemplate", schema: templateSchema.extend({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.inputTemplate.update({
      where: { id: i.id },
      data: { disciplina: i.disciplina || null, pergunta: i.pergunta, ordem: i.ordem ?? 0 },
    });
    revalidatePath("/configuracoes/inputs");
    return { id: i.id };
  },
);

export const excluirInputTemplate = defineAction(
  { ...projBase, acao: "excluir-input-template", entidade: "InputTemplate", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.inputTemplate.delete({ where: { id: i.id } });
    revalidatePath("/configuracoes/inputs");
    return { id: i.id };
  },
);
