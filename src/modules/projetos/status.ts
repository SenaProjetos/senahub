import type { StatusDisciplina } from "@/generated/prisma/client";

export const STATUS_LABEL: Record<StatusDisciplina, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  entregue: "Entregue",
  aprovado: "Aprovado",
};

/** Classes Tailwind para o chip de status (usa cores semânticas do tema). */
export const STATUS_CHIP: Record<StatusDisciplina, string> = {
  aguardando: "text-status-aguardando border-status-aguardando/40 bg-status-aguardando/10",
  em_andamento: "text-status-andamento border-status-andamento/40 bg-status-andamento/10",
  em_revisao: "text-status-revisao border-status-revisao/40 bg-status-revisao/10",
  entregue: "text-status-entregue border-status-entregue/40 bg-status-entregue/10",
  aprovado: "text-status-aprovado border-status-aprovado/40 bg-status-aprovado/10",
};

export const SITUACAO_PROJETO_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
  cancelado: "Cancelado",
};
