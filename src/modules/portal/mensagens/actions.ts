"use server";

import { defineAction, ActionError } from "@/lib/with-action";
import { avisarMensagemNova, emitirAtualizacaoDaConversa } from "./avisos";
import { conversaParaCliente, conversaParaEquipe } from "./queries";
import { MOTIVO_NAO_ENCONTRADA } from "./regras";
import {
  carregarConversaSchema,
  desmarcarDecisaoSchema,
  enviarMensagemSchema,
  marcarConversaLidaSchema,
  marcarDecisaoSchema,
  salvarAvisoPortalMensagemSchema,
} from "./schemas";
import {
  definirAvisoPortalMensagem,
  desmarcarDecisao,
  enviarMensagem,
  marcarDecisao,
  marcarLida,
} from "./service";

/**
 * Conversa do cliente com a coordenação (spec `docs/superpowers/specs/2026-11-21-portal-mensagens-coordenacao-design.md`).
 * As do CLIENTE não têm permissão de catálogo: conta externa aqui e, no serviço, a porta do portal. As da EQUIPE são
 * `interno: true` e a audiência (`podeVerConversa`) é conferida no serviço. Toda recusa: "Conversa não encontrada.".
 * O texto da mensagem não entra na auditoria (`redact`): a tela de auditoria não é porta para ler a conversa.
 * Avisos (sino, e-mail, Socket.io) depois do commit, aguardados e sem nunca derrubar a mensagem.
 */

async function avisarSemFalhar(mensagemId: string): Promise<void> {
  try {
    await avisarMensagemNova(mensagemId);
  } catch (e) {
    console.error("[portal-mensagens] avisos da mensagem falharam:", e);
  }
}

async function emitirSemFalhar(projetoId: string): Promise<void> {
  try {
    await emitirAtualizacaoDaConversa(projetoId);
  } catch (e) {
    console.error("[portal-mensagens] emissão da decisão falhou:", e);
  }
}

function exigirConversa<T>(c: T | null): T {
  if (!c) throw new ActionError(MOTIVO_NAO_ENCONTRADA);
  return c;
}

// ── Cliente ────────────────────────────────────────────────────────────────────────────────

export const enviarMensagemCliente = defineAction(
  {
    modulo: "portal",
    acao: "mensagem-cliente-enviar",
    entidade: "MensagemPortal",
    schema: enviarMensagemSchema,
    redact: ["texto"],
    entidadeId: (data) => (data as { mensagemId: string }).mensagemId,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADA);
    const r = await enviarMensagem({
      projetoId: input.projetoId,
      autor: { userId: user.id, nome: user.name, lado: "cliente" },
      texto: input.texto,
      comAnexos: input.comAnexos,
    });
    await avisarSemFalhar(r.mensagemId);
    return { mensagemId: r.mensagemId };
  },
);

export const carregarConversaCliente = defineAction(
  { modulo: "portal", acao: "mensagem-cliente-carregar", schema: carregarConversaSchema, audit: false },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADA);
    return exigirConversa(await conversaParaCliente(input.projetoId, user.id, input.antesDe));
  },
);

export const marcarConversaLidaCliente = defineAction(
  { modulo: "portal", acao: "mensagem-cliente-lida", schema: marcarConversaLidaSchema, audit: false },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADA);
    await marcarLida({ projetoId: input.projetoId, userId: user.id, ate: input.ate });
    return { ok: true };
  },
);

/** O cliente liga ou desliga o e-mail de mensagem nova (Meus projetos). Grava só `notif_portal_mensagem`. */
export const salvarAvisoPortalMensagem = defineAction(
  {
    modulo: "portal",
    acao: "salvar-aviso-portal-mensagem",
    entidade: "UserPreference",
    schema: salvarAvisoPortalMensagemSchema,
    entidadeId: (data) => (data as { userId: string }).userId,
  },
  async (input, ctx) => {
    if (ctx.user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADA);
    await definirAvisoPortalMensagem(ctx.user.id, input.quer);
    return { userId: ctx.user.id };
  },
);

// ── Equipe ─────────────────────────────────────────────────────────────────────────────────

export const enviarMensagemEquipe = defineAction(
  {
    modulo: "portal",
    acao: "mensagem-equipe-enviar",
    entidade: "MensagemPortal",
    interno: true,
    schema: enviarMensagemSchema,
    redact: ["texto"],
    entidadeId: (data) => (data as { mensagemId: string }).mensagemId,
  },
  async (input, { user }) => {
    const r = await enviarMensagem({
      projetoId: input.projetoId,
      autor: { userId: user.id, nome: user.name, lado: "equipe" },
      texto: input.texto,
      comAnexos: input.comAnexos,
    });
    await avisarSemFalhar(r.mensagemId);
    return { mensagemId: r.mensagemId };
  },
);

export const carregarConversaEquipe = defineAction(
  { modulo: "portal", acao: "mensagem-equipe-carregar", interno: true, schema: carregarConversaSchema, audit: false },
  async (input, { user }) => exigirConversa(await conversaParaEquipe(input.projetoId, user.id, input.antesDe)),
);

export const marcarConversaLidaEquipe = defineAction(
  { modulo: "portal", acao: "mensagem-equipe-lida", interno: true, schema: marcarConversaLidaSchema, audit: false },
  async (input, { user }) => {
    await marcarLida({ projetoId: input.projetoId, userId: user.id, ate: input.ate });
    return { ok: true };
  },
);

export const marcarDecisaoDoCliente = defineAction(
  {
    modulo: "portal",
    acao: "mensagem-decisao-marcar",
    entidade: "MensagemPortal",
    interno: true,
    schema: marcarDecisaoSchema,
    // O resumo é o que o cliente decidiu: fica fora da auditoria, como o texto da mensagem.
    redact: ["resumo"],
    entidadeId: (_data, input) => input.mensagemId,
  },
  async (input, { user }) => {
    const { projetoId } = await marcarDecisao({ mensagemId: input.mensagemId, userId: user.id, resumo: input.resumo ?? null });
    await emitirSemFalhar(projetoId);
    return { ok: true };
  },
);

export const desmarcarDecisaoDoCliente = defineAction(
  {
    modulo: "portal",
    acao: "mensagem-decisao-desmarcar",
    entidade: "MensagemPortal",
    interno: true,
    schema: desmarcarDecisaoSchema,
    entidadeId: (_data, input) => input.mensagemId,
  },
  async (input, { user }) => {
    const { projetoId } = await desmarcarDecisao({ mensagemId: input.mensagemId, userId: user.id });
    await emitirSemFalhar(projetoId);
    return { ok: true };
  },
);
