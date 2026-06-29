/**
 * Prioridade de tarefa (Mód 5 do CONSELHO1). String livre no banco (como TicketSuporte),
 * mas restrita a estes valores no app. Puro/cliente-safe — usado no board, no dialog e nas actions.
 */
export const PRIORIDADES = ["baixa", "media", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

/** Classe do badge (cores semânticas via tokens — nunca hex hardcoded). */
export const PRIORIDADE_CLASS: Record<Prioridade, string> = {
  baixa: "text-muted-foreground border-border",
  media: "text-info border-info/40",
  alta: "text-warning border-warning/40",
  urgente: "text-destructive border-destructive/40",
};

export function ehPrioridade(v: string | null | undefined): v is Prioridade {
  return v != null && (PRIORIDADES as readonly string[]).includes(v);
}
