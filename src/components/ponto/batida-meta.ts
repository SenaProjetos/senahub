import { Play, Square, Coffee, Utensils, type LucideIcon } from "lucide-react";
import type { TipoBatida } from "@/lib/ponto-offline";
import type { EstadoJornada } from "@/modules/ponto/engine";

/**
 * Rótulos e botões da máquina de estados do ponto — compartilhados pela tela `/ponto`
 * e pela miniatura do header (arquivo sem componente pesado de propósito: o header não
 * pode arrastar dialogs/selects da tela cheia para o bundle de todas as páginas).
 */

export const ESTADO_LABEL: Record<EstadoJornada, string> = {
  fora: "Fora da jornada",
  trabalhando: "Trabalhando",
  descansando: "Em descanso",
};

export const TIPO_LABEL: Record<TipoBatida, string> = {
  entrada: "Entrada",
  inicio_descanso: "Início do descanso",
  fim_descanso: "Fim do descanso",
  saida: "Saída",
};

export type BotaoBatida = {
  label: string;
  icon: LucideIcon;
  variant: "default" | "outline" | "destructive" | "secondary";
};

export const BOTAO: Record<TipoBatida, BotaoBatida> = {
  entrada: { label: "Iniciar jornada", icon: Play, variant: "default" },
  inicio_descanso: { label: "Iniciar descanso", icon: Coffee, variant: "secondary" },
  fim_descanso: { label: "Voltar do descanso", icon: Utensils, variant: "default" },
  saida: { label: "Encerrar jornada", icon: Square, variant: "destructive" },
};

/** Cor do ponto de status (o texto ao lado nunca some — cor sozinha não comunica). */
export const COR_ESTADO: Record<EstadoJornada, string> = {
  fora: "bg-muted-foreground/40",
  trabalhando: "animate-pulse bg-success",
  descansando: "bg-warning",
};
