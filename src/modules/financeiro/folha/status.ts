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

/** `tipoProfissional` é o papel do projetista gravado na liberação — a tela mostrava o enum cru. */
export const TIPO_PROFISSIONAL_LABEL: Record<string, string> = {
  projetista_pj: "PJ",
  freelancer: "Freelancer",
  clt: "CLT",
  estagiario: "Estagiário",
};

/** A partir de quantos dias um pagamento pendente ganha a marcação de "parado". */
export const DIAS_PENDENTE_PARADO = 30;

/**
 * `null` = padrão da tela: esconde cancelados (pendentes + pagos). `todos` não filtra.
 * Mudou na F2: na F1, `?status=` ausente não filtrava nada.
 */
export type FiltroStatus = "pendente" | "pago" | "cancelado" | "todos";

/** Filtros da aba Pagamentos — lidos da URL no servidor, espelhados na barra de filtros. */
export type FiltrosFolha = {
  status: FiltroStatus | null;
  projetistaId: string;
  projetoId: string;
  /** Liberação a partir de (yyyy-mm-dd, inclusive). */
  de: string;
  /** Liberação até (yyyy-mm-dd, inclusive). */
  ate: string;
  q: string;
};
