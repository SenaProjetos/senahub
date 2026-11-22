import { z } from "zod";
import { RESUMO_MAX, TEXTO_MAX } from "./regras";

/**
 * Conversa do cliente com a coordenação (spec 2026-11-21-portal-mensagens-coordenacao-design.md). O texto é conferido
 * de novo no serviço (`motivoParaNaoEnviar`, após o trim); o teto aqui só barra o que já passa do limite sem o trim.
 */

const projetoId = z.string().min(1);

export const enviarMensagemSchema = z.object({
  projetoId,
  texto: z.string().max(TEXTO_MAX * 2, "A mensagem passa de 5.000 caracteres."),
  comAnexos: z.boolean().default(false),
});

export const carregarConversaSchema = z.object({
  projetoId,
  /** Id da mensagem mais antiga já carregada ("ver anteriores"). */
  antesDe: z.string().min(1).optional(),
});

export const marcarConversaLidaSchema = z.object({
  projetoId,
  /** Hora da última mensagem carregada na tela; o serviço limita a agora e nunca recua. */
  ate: z.coerce.date(),
});

export const marcarDecisaoSchema = z.object({
  mensagemId: z.string().min(1),
  resumo: z.string().max(RESUMO_MAX, `O resumo passa de ${RESUMO_MAX} caracteres.`).nullish(),
});

export const desmarcarDecisaoSchema = z.object({
  mensagemId: z.string().min(1),
});

export const salvarAvisoPortalMensagemSchema = z.object({ quer: z.boolean() });
