import type { StatusDisciplina } from "@/generated/prisma/client";

/** Status que encerram a disciplina — não contam como atraso mesmo após o prazo. */
const STATUS_CONCLUIDOS: ReadonlySet<StatusDisciplina> = new Set(["entregue", "aprovado"]);

/**
 * Dias de atraso de uma disciplina (>0 se atrasada, senão 0).
 * Atrasada = tem `prazo` no passado E status ainda não concluído/aprovado.
 * Compara em dias-calendário (ignora horas) para evitar falso atraso no mesmo dia.
 */
export function diasDeAtraso(
  prazo: string | Date | null | undefined,
  status: StatusDisciplina,
  agora: Date = new Date(),
): number {
  if (!prazo || STATUS_CONCLUIDOS.has(status)) return 0;
  const limite = new Date(prazo);
  if (Number.isNaN(limite.getTime())) return 0;
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const venc = new Date(limite.getFullYear(), limite.getMonth(), limite.getDate());
  const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000);
  return dias > 0 ? dias : 0;
}
