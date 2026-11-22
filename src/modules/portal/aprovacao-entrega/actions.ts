"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction, ActionError } from "@/lib/with-action";
import { avisarAnulacao, avisarEnvio, avisarResposta } from "./avisos";
import { formularioDeEnvio } from "./queries";
import { MOTIVO_NAO_ENCONTRADO } from "./regras";
import {
  anularRespostaSchema,
  cancelarAprovacaoSchema,
  carregarFormularioSchema,
  enviarAprovacaoSchema,
  registrarPorForaSchema,
  responderAprovacaoSchema,
} from "./schemas";
import { anularResposta, cancelarAprovacao, enviarAprovacao, registrarPorFora, responderPeloPortal } from "./service";

/**
 * Aprovação formal da entrega (spec `docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md`).
 * As da EQUIPE são `interno: true` e a audiência da conversa com a coordenação é conferida no serviço; a do CLIENTE não
 * tem permissão de catálogo (conta externa aqui, porta do portal no serviço). Toda recusa de porta: "Pedido não
 * encontrado.". Avisos depois do commit, sem nunca derrubar a escrita.
 */

async function semFalhar(rotulo: string, f: () => Promise<unknown>): Promise<void> {
  try {
    await f();
  } catch (e) {
    console.error(`[aprovacao-entrega] ${rotulo} falhou:`, e);
  }
}

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/cliente`);
  revalidatePath(`/portal/${projetoId}`);
}

const pacoteAntes = (input: { aprovacaoId: string }) =>
  prisma.aprovacaoEntrega.findUnique({
    where: { id: input.aprovacaoId },
    select: { id: true, projetoId: true, titulo: true, status: true, parcelaId: true },
  });

// ── Equipe ─────────────────────────────────────────────────────────────────────────────────

export const enviarAprovacaoEntrega = defineAction(
  {
    modulo: "portal",
    acao: "aprovacao-entrega-enviar",
    entidade: "AprovacaoEntrega",
    interno: true,
    schema: enviarAprovacaoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    const r = await enviarAprovacao({
      projetoId: input.projetoId,
      quem: { userId: user.id, nome: user.name },
      titulo: input.titulo,
      mensagem: input.mensagem ?? null,
      uploadIds: input.uploadIds,
      parcelaId: input.parcelaId ?? null,
    });
    await semFalhar("aviso do envio", () => avisarEnvio(r.id));
    revalidar(input.projetoId);
    return { id: r.id };
  },
);

export const cancelarAprovacaoEntrega = defineAction(
  {
    modulo: "portal",
    acao: "aprovacao-entrega-cancelar",
    entidade: "AprovacaoEntrega",
    interno: true,
    schema: cancelarAprovacaoSchema,
    capturarAntes: pacoteAntes,
    entidadeId: (_data, input) => input.aprovacaoId,
  },
  async (input, { user }) => {
    const { projetoId } = await cancelarAprovacao({ aprovacaoId: input.aprovacaoId, quem: { userId: user.id, nome: user.name } });
    revalidar(projetoId);
    return { ok: true };
  },
);

export const registrarRespostaPorFora = defineAction(
  {
    modulo: "portal",
    acao: "aprovacao-entrega-registrar-por-fora",
    entidade: "AprovacaoEntrega",
    interno: true,
    schema: registrarPorForaSchema,
    capturarAntes: pacoteAntes,
    entidadeId: (_data, input) => input.aprovacaoId,
  },
  async (input, { user }) => {
    const r = await registrarPorFora({
      aprovacaoId: input.aprovacaoId,
      quem: { userId: user.id, nome: user.name },
      resposta: input.resposta,
      texto: input.texto ?? null,
      dia: input.dia,
      respondidoPorNome: input.respondidoPorNome,
      comprovanteId: input.comprovanteId,
    });
    await semFalhar("aviso da resposta", () => avisarResposta(r.respostaId));
    revalidar(r.projetoId);
    return { respostaId: r.respostaId };
  },
);

export const anularRespostaAprovacao = defineAction(
  {
    modulo: "portal",
    acao: "aprovacao-entrega-anular",
    entidade: "RespostaAprovacaoEntrega",
    interno: true,
    schema: anularRespostaSchema,
    capturarAntes: (input) =>
      prisma.respostaAprovacaoEntrega.findUnique({
        where: { id: input.respostaId },
        select: { id: true, aprovacaoId: true, resposta: true, origem: true, anuladaEm: true },
      }),
    entidadeId: (_data, input) => input.respostaId,
  },
  async (input, { user }) => {
    const r = await anularResposta({ respostaId: input.respostaId, quem: { userId: user.id, nome: user.name }, motivo: input.motivo });
    await semFalhar("aviso da anulação", () => avisarAnulacao(input.respostaId));
    revalidar(r.projetoId);
    return { ok: true };
  },
);

export const carregarFormularioAprovacao = defineAction(
  { modulo: "portal", acao: "aprovacao-entrega-formulario", interno: true, schema: carregarFormularioSchema, audit: false },
  async (input, { user }) => {
    const f = await formularioDeEnvio(input.projetoId, user.id);
    if (!f) throw new ActionError(MOTIVO_NAO_ENCONTRADO);
    return f;
  },
);

// ── Cliente ────────────────────────────────────────────────────────────────────────────────

export const responderAprovacaoEntrega = defineAction(
  {
    modulo: "portal",
    acao: "aprovacao-entrega-responder",
    entidade: "AprovacaoEntrega",
    schema: responderAprovacaoSchema,
    entidadeId: (_data, input) => input.aprovacaoId,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADO);
    const r = await responderPeloPortal({
      aprovacaoId: input.aprovacaoId,
      conta: { userId: user.id, nome: user.name },
      resposta: input.resposta,
      texto: input.texto ?? null,
      impressaoDigital: input.impressaoDigital,
    });
    await semFalhar("aviso da resposta", () => avisarResposta(r.respostaId));
    revalidar(r.projetoId);
    return { ok: true };
  },
);
