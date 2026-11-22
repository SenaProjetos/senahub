import { z } from "zod";
import { MOTIVO_TEXTO_LONGO, RESUMO_MAX, TEXTO_MAX } from "./regras";

/**
 * Conversa do cliente com a coordenação (spec 2026-11-21-portal-mensagens-coordenacao-design.md). O texto é conferido
 * de novo no serviço (`motivoParaNaoEnviar`, após o trim); o teto aqui só barra o que já passa do limite sem o trim.
 */

// Toda mensagem em pt-BR: a padrão do Zod 4 é em inglês, e `with-action` mostra `issues[0].message` na tela.
const PROJETO_NAO_INFORMADO = "Projeto não informado.";
const MENSAGEM_NAO_INFORMADA = "Mensagem não informada.";
const OPCAO_INVALIDA = "Opção inválida.";
const REFERENCIA_INVALIDA = "Mensagem de referência inválida.";

const projetoId = z.string({ error: PROJETO_NAO_INFORMADO }).min(1, PROJETO_NAO_INFORMADO);
const mensagemId = z.string({ error: MENSAGEM_NAO_INFORMADA }).min(1, MENSAGEM_NAO_INFORMADA);

export const enviarMensagemSchema = z.object({
  projetoId,
  // O teto aqui é o DOBRO do limite porque o limite vale depois do trim (feito no serviço, `motivoParaNaoEnviar`):
  // este só barra o corpo absurdo, com a mesma frase que o serviço dá a quem passa do limite já aparado.
  texto: z.string({ error: "Escreva a mensagem." }).max(TEXTO_MAX * 2, MOTIVO_TEXTO_LONGO),
  comAnexos: z.boolean({ error: OPCAO_INVALIDA }).default(false),
});

export const carregarConversaSchema = z.object({
  projetoId,
  /** Id da mensagem mais antiga já carregada ("ver anteriores"). */
  antesDe: z.string({ error: REFERENCIA_INVALIDA }).min(1, REFERENCIA_INVALIDA).optional(),
});

export const marcarConversaLidaSchema = z.object({
  projetoId,
  /** Hora da última mensagem carregada na tela; o serviço limita a agora e nunca recua. */
  ate: z.coerce.date({ error: "Data inválida." }),
});

export const marcarDecisaoSchema = z.object({
  mensagemId,
  resumo: z.string({ error: "Resumo inválido." }).max(RESUMO_MAX, `O resumo passa de ${RESUMO_MAX} caracteres.`).nullish(),
});

export const desmarcarDecisaoSchema = z.object({ mensagemId });

export const salvarAvisoPortalMensagemSchema = z.object({ quer: z.boolean({ error: OPCAO_INVALIDA }) });
