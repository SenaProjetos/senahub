import type { StatusBriefing } from "@/modules/inputs/briefing-schema";

/** Rótulo e tom do status do briefing — o mesmo na aba Inputs da equipe e no card do portal do cliente. */
export const STATUS_LABEL: Record<StatusBriefing, string> = {
  nao_iniciado: "Não iniciado",
  em_preenchimento: "Em preenchimento",
  completo: "Completo",
};

export const STATUS_TONE: Record<StatusBriefing, string> = {
  nao_iniciado: "text-muted-foreground",
  em_preenchimento: "border-warning/40 text-warning",
  completo: "border-success/40 text-success",
};
