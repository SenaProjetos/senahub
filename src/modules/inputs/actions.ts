"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { calcularStatusBriefing, existeNoBriefing, secoesDoProjeto } from "@/modules/inputs/briefing-schema";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";
import { gravarRespostasBriefing } from "@/modules/inputs/briefing-service";
import { aplicarInputsPadraoCore } from "@/modules/inputs/inputs-padrao-service";
import { gravarRespostasExtras } from "@/modules/inputs/extras-service";
import { encerrarBriefingNoPortal, pedirBriefingNoPortal } from "@/modules/inputs/portal-pedido-service";
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
    // A equipe grava sempre, mesmo com o pedido do portal encerrado.
    const r = await gravarRespostasExtras(input.projetoId, input.respostas, "equipe");
    if (!r.ok) throw new ActionError(r.erro);
    const { salvas } = r;
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
    return { projetoId: input.projetoId, status: r.status, descartados: r.descartados };
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
    const status = await prisma.$transaction(async (tx) => {
      // A linha pode não existir (briefing nunca preenchido). Depois de garantida, a trava
      // serializa dois cliques simultâneos — sem ela, um sobrescreveria a lista do outro.
      await tx.briefingProjeto.createMany({ data: [{ projetoId: input.projetoId }], skipDuplicates: true });
      await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "projetoId" = ${input.projetoId} FOR UPDATE`;
      const atual = await tx.briefingProjeto.findUniqueOrThrow({
        where: { projetoId: input.projetoId },
        select: { respostasJson: true, secoesOcultas: true, camposOcultos: true, modeloId: true },
      });
      const modelo = await resolverModeloDoProjeto(input.projetoId, atual.modeloId, tx);
      // Mostrar de novo vale mesmo para chave que saiu do modelo (limpa a ocultação órfã).
      if (input.oculto && !existeNoBriefing(input.alvo, input.chave, modelo.secoes)) {
        throw new ActionError("Pergunta do briefing não encontrada.");
      }
      const lista = input.alvo === "secao" ? atual.secoesOcultas : atual.camposOcultos;
      const nova = input.oculto ? [...new Set([...lista, input.chave])] : lista.filter((c) => c !== input.chave);
      const ocultos = {
        secoes: input.alvo === "secao" ? nova : atual.secoesOcultas,
        campos: input.alvo === "campo" ? nova : atual.camposOcultos,
      };
      const disciplinas = (await tx.disciplina.findMany({ where: { projetoId: input.projetoId }, select: { disciplinaTextoLegado: true } })).map((d) => d.disciplinaTextoLegado);
      const novoStatus = calcularStatusBriefing(
        (atual.respostasJson ?? {}) as Record<string, unknown>,
        secoesDoProjeto(modelo.secoes, disciplinas, ocultos),
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

// ── Briefing pelo portal do cliente ───────────────────────────
const pedidoPortalSchema = z.object({ projetoId: z.string().min(1, "Projeto não informado.") });
// Só o estado do pedido vai para o "antes" da auditoria: as respostas do briefing (dados pessoais) ficam de fora.
const briefingDoProjeto = (i: { projetoId: string }) =>
  prisma.briefingProjeto.findUnique({
    where: { projetoId: i.projetoId },
    select: {
      portalPedidoEm: true,
      portalPedidoPorId: true,
      portalEncerradoEm: true,
      portalEncerradoPorId: true,
      status: true,
      avisoEquipeEm: true,
    },
  });

/** Pede (ou reabre) o briefing no portal: sino + e-mail a cada conta ativa do cliente. */
export const pedirBriefingPortal = defineAction(
  {
    ...projBase,
    acao: "pedir-briefing-portal",
    entidade: "BriefingProjeto",
    schema: pedidoPortalSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: briefingDoProjeto,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const r = await pedirBriefingNoPortal(input.projetoId, user.id);
    if (!r.ok) throw new ActionError(r.erro);
    revalidatePath(`/projetos/${input.projetoId}/inputs`);
    return { projetoId: input.projetoId, reaberto: r.reaberto, avisadas: r.avisadas, emails: r.emails };
  },
);

/** Encerra o pedido do briefing no portal: nem o portal nem o link gravam mais; a equipe segue podendo. */
export const encerrarBriefingPortal = defineAction(
  {
    ...projBase,
    acao: "encerrar-briefing-portal",
    entidade: "BriefingProjeto",
    schema: pedidoPortalSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    capturarAntes: briefingDoProjeto,
  },
  async (input, { user }) => {
    await exigirProjetoVisivel(user, input.projetoId);
    const r = await encerrarBriefingNoPortal(input.projetoId, user.id);
    if (!r.ok) throw new ActionError(r.erro);
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
