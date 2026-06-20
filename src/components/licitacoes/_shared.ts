export const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  ganha: "Ganha",
  perdida: "Perdida",
  em_execucao: "Em execução",
  concluida: "Concluída",
};

export const STATUS_CHIP: Record<string, string> = {
  em_andamento: "text-status-andamento border-status-andamento/40",
  ganha: "text-success border-success/40",
  perdida: "text-destructive border-destructive/40",
  em_execucao: "text-status-entregue border-status-entregue/40",
  concluida: "text-muted-foreground",
};

export { brl } from "@/lib/utils";
