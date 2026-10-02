import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { motivoPeriodoFechado } from "@/modules/financeiro/fechamento/trava";

type Db = Prisma.TransactionClient | typeof prisma;

/** Meses com fechamento FECHADO, como `YYYY-MM` (N5). */
export async function mesesFechados(db: Db = prisma): Promise<Set<string>> {
  const fs = await db.fechamentoMensal.findMany({ where: { status: "fechado" }, select: { ano: true, mes: true } });
  return new Set(fs.map((f) => `${f.ano}-${String(f.mes).padStart(2, "0")}`));
}

/** Recusa (`ActionError`) se alguma das datas cai em mês fechado. */
export async function exigirPeriodoAberto(db: Db, datas: readonly (Date | string | null | undefined)[]): Promise<void> {
  if (datas.every((d) => d == null)) return;
  const motivo = motivoPeriodoFechado(datas, await mesesFechados(db));
  if (motivo) throw new ActionError(motivo);
}

/** Datas que o mês fechado protege num lançamento: competência (ou data) e, se pago, o pagamento. */
export function datasDoLancamento(l: { data: Date; dataCompetencia: Date | null; dataConfirmacao: Date | null; status: string }) {
  return [l.dataCompetencia ?? l.data, l.status === "confirmado" ? l.dataConfirmacao : null];
}
