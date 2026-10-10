/**
 * "Enviei os documentos desta etapa para análise" (áudio do dono, 2026-10-10). Regras puras, sem I/O.
 *
 * Quem clica é o responsável da disciplina (o projetista, que não bate ponto quando é PJ): a etapa
 * vai para "Entregue" e a coordenação é avisada. Ele pode desfazer enquanto a coordenação não aprovou.
 * As frases são as mesmas da recusa no servidor e do botão desabilitado na tela.
 */
import type { StatusDisciplina } from "@/generated/prisma/enums";

export const MOTIVO_NAO_RESPONSAVEL = "Só quem é responsável pela disciplina pode sinalizar o envio da etapa.";
export const MOTIVO_JA_APROVADA = "A coordenação já aprovou esta etapa.";
export const MOTIVO_JA_ENVIADA = "Esta etapa já foi enviada para análise.";
export const MOTIVO_NAO_ENVIADA = "Esta etapa não está enviada para análise.";

export function motivoParaEnviar(status: StatusDisciplina): string | null {
  if (status === "aprovado") return MOTIVO_JA_APROVADA;
  if (status === "entregue") return MOTIVO_JA_ENVIADA;
  return null;
}

export function motivoParaDesfazerEnvio(status: StatusDisciplina): string | null {
  if (status === "aprovado") return `${MOTIVO_JA_APROVADA} O envio não pode mais ser desfeito.`;
  if (status !== "entregue") return MOTIVO_NAO_ENVIADA;
  return null;
}

/** Para onde a etapa volta ao desfazer: ao trabalho — a coordenação ainda não olhou. */
export const STATUS_AO_DESFAZER: StatusDisciplina = "em_andamento";
