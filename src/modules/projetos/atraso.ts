import type { StatusDisciplina } from "@/generated/prisma/client";
import { inicioDoDia, inicioDoDiaLocal } from "@/lib/data";

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
  // `inicioDoDia` normaliza a meia-noite UTC do banco: sem isso a disciplina
  // aparecia atrasada um dia antes em America/Sao_Paulo.
  const venc = inicioDoDia(prazo);
  if (!venc) return 0;
  const hoje = inicioDoDiaLocal(agora);
  const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000);
  return dias > 0 ? dias : 0;
}
