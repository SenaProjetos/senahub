export const STATUS_ORCAMENTO_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_elaboracao: "Em elaboração",
  concluido: "Concluído",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
};

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_ORCAMENTO_TONE: Record<string, StatusTone> = {
  rascunho: "neutral",
  em_elaboracao: "info",
  concluido: "warning",
  aprovado: "success",
  cancelado: "danger",
};

export const REGIME_ENCARGOS_LABEL: Record<string, string> = {
  desonerado: "Desonerado",
  nao_desonerado: "Não desonerado",
};

/** Percentual: 22,24% (2 casas, vírgula pt-BR). */
export function formatarPercentual(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
