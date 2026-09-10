/** Rótulo e cor do status de `PagamentoProjetista` — a tela mostrava o enum cru. */
export const STATUS_PAGAMENTO_LABEL: Record<string, string> = {
  pendente: "A pagar",
  pago: "Pago",
  cancelado: "Cancelado",
};

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_PAGAMENTO_TONE: Record<string, StatusTone> = {
  pendente: "warning",
  pago: "success",
  cancelado: "neutral",
};
