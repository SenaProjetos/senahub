/**
 * Etapas no card da disciplina (áudio do dono, 2026-10-10). Regras puras, sem I/O.
 *
 * O projetista vê TODAS as etapas com início e fim; a "atual" é a primeira ainda não aprovada, na
 * ordem em que foram cadastradas.
 */
import type { StatusDisciplina } from "@/generated/prisma/enums";

export type EtapaDoCard = {
  id: string;
  sigla: string;
  nome: string;
  status: StatusDisciplina;
  /** `YYYY-MM-DD` ou nulo (a coordenação ainda não informou). */
  inicio: string | null;
  prazo: string | null;
};

/** Primeira etapa que ainda não foi aprovada; `null` quando todas foram (ou não há etapa). */
export function etapaAtualDoCard<T extends Pick<EtapaDoCard, "status">>(etapas: readonly T[]): T | null {
  return etapas.find((e) => e.status !== "aprovado") ?? null;
}

/** A etapa passou do fim e ainda não foi entregue nem aprovada? */
export function etapaAtrasada(e: Pick<EtapaDoCard, "status" | "prazo">, hoje: string): boolean {
  return e.prazo != null && e.prazo < hoje && e.status !== "entregue" && e.status !== "aprovado";
}
