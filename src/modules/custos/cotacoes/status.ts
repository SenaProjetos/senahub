export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_RFQ_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};

export const STATUS_RFQ_TONE: Record<string, StatusTone> = {
  rascunho: "neutral",
  aberta: "info",
  encerrada: "success",
  cancelada: "danger",
};

export const STATUS_CONVITE_LABEL: Record<string, string> = {
  convidado: "Convidado",
  respondido: "Respondido",
  sem_resposta: "Sem resposta",
};

export const STATUS_PROPOSTA_LABEL: Record<string, string> = {
  recebida: "Recebida",
  vencedora: "Vencedora",
  nao_escolhida: "Não escolhida",
};

export const STATUS_PROPOSTA_TONE: Record<string, StatusTone> = {
  recebida: "neutral",
  vencedora: "success",
  nao_escolhida: "danger",
};
