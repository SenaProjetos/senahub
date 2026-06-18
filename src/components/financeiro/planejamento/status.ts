export type StatusPlano = "rascunho" | "analise" | "aprovado" | "executado" | "cancelado";

export const STATUS_META: Record<StatusPlano, { label: string; classe: string }> = {
  rascunho: { label: "Rascunho", classe: "text-muted-foreground border-border" },
  analise: { label: "Em análise", classe: "text-warning border-warning/40" },
  aprovado: { label: "Aprovado", classe: "text-info border-info/40" },
  executado: { label: "Executado", classe: "text-success border-success/40" },
  cancelado: { label: "Cancelado", classe: "text-destructive border-destructive/40" },
};
