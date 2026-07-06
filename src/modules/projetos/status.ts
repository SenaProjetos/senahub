import type { StatusDisciplina } from "@/generated/prisma/client";

export const STATUS_LABEL: Record<StatusDisciplina, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  entregue: "Entregue",
  aprovado: "Aprovado",
};

/** Tom semântico do status (cor + ícone) para o `StatusBadge` — acessível a daltônicos. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export const STATUS_TONE: Record<StatusDisciplina, StatusTone> = {
  aguardando: "neutral",
  em_andamento: "warning",
  em_revisao: "info",
  entregue: "info",
  aprovado: "success",
};

/**
 * Classes Tailwind para o chip de status (usa cores semânticas do tema).
 * `DOT` = quadradinho de acento (::before) na cor do status — assinatura do design "Marca Registrada".
 */
const DOT = "before:size-1.5 before:shrink-0 before:bg-current before:content-['']";
export const STATUS_CHIP: Record<StatusDisciplina, string> = {
  aguardando: `${DOT} text-status-aguardando border-status-aguardando/40 bg-status-aguardando/10`,
  em_andamento: `${DOT} text-status-andamento border-status-andamento/40 bg-status-andamento/10`,
  em_revisao: `${DOT} text-status-revisao border-status-revisao/40 bg-status-revisao/10`,
  entregue: `${DOT} text-status-entregue border-status-entregue/40 bg-status-entregue/10`,
  aprovado: `${DOT} text-status-aprovado border-status-aprovado/40 bg-status-aprovado/10`,
};

/**
 * Classe de COR de texto por status — para tingir ícones de disciplina pela cor do status
 * (Mód 2/15). Usar junto de `iconeDisciplina()` (lib/disciplinas) + tooltip/aria-label do status,
 * nunca cor isolada.
 */
export const STATUS_TEXT: Record<StatusDisciplina, string> = {
  aguardando: "text-status-aguardando",
  em_andamento: "text-status-andamento",
  em_revisao: "text-status-revisao",
  entregue: "text-status-entregue",
  aprovado: "text-status-aprovado",
};

export const TIPO_PROJETO_LABEL: Record<string, string> = {
  particular: "Particular",
  licitacao: "Licitação",
  aprovacao: "Aprovação",
};

export const SITUACAO_PROJETO_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
  cancelado: "Cancelado",
};

/**
 * Peso de progresso por status de disciplina (0–1).
 * Fonte única usada na barra do detalhe e nos cards do dashboard.
 */
export const PESO_STATUS: Record<StatusDisciplina, number> = {
  aguardando: 0,
  em_andamento: 0.4,
  em_revisao: 0.6,
  entregue: 0.85,
  aprovado: 1,
};

/** Progresso 0–100 do projeto: média dos pesos de status das disciplinas. */
export function progressoProjeto(statuses: StatusDisciplina[]): number {
  if (statuses.length === 0) return 0;
  const soma = statuses.reduce((s, st) => s + PESO_STATUS[st], 0);
  return Math.round((soma / statuses.length) * 100);
}

/** Progresso 0–100 derivado do status de uma disciplina (P-33). */
export function progressoDoStatus(status: StatusDisciplina): number {
  return Math.round(PESO_STATUS[status] * 100);
}
