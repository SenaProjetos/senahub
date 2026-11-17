import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { sobrepoeAusencia, type PeriodoAusencia } from "./abono-entrada";

type Tx = Prisma.TransactionClient;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Opções da transação que toma a trava: a espera pela trava conta no tempo da transação, então
 * o padrão do Prisma (5 s) estouraria com dois lançamentos seguidos da mesma pessoa.
 */
export const OPCOES_TX_AUSENCIA = { maxWait: 10_000, timeout: 20_000 } as const;

/** Frase quando a transação desiste de esperar (outra gravação da mesma pessoa demorou). */
export const MOTIVO_AUSENCIA_OCUPADA =
  "Outra gravação de ausência desta pessoa está em andamento. Aguarde um instante e tente de novo.";

/** A transação desistiu de esperar (P2028 do Prisma: tempo da transação ou da conexão). */
export function ehTempoEsgotado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2028";
}

/**
 * Trava as ausências de UMA pessoa até o fim da transação. Lançar (RH) e aprovar (fila) conferem
 * sobreposição e depois gravam; sem a trava, duas gravações ao mesmo tempo passavam pela mesma
 * conferência e as horas contavam duas vezes. Não há índice que impeça isso (a sobreposição
 * depende das janelas de horário), então a fila é por pessoa, no banco.
 */
export async function travarAusenciasDaPessoa(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ausencia:${userId}`}))`;
}

/**
 * Primeira ausência da pessoa, com um dos `status`, que cobre o mesmo tempo que `periodo`
 * (`sobrepoeAusencia`: janelas no mesmo dia que não se cruzam convivem). `excetoId` tira a própria
 * linha quando quem confere é a aprovação dela.
 */
export async function ausenciaSobreposta(
  db: Tx,
  userId: string,
  periodo: PeriodoAusencia,
  status: ("pendente" | "aprovado")[],
  excetoId?: string,
): Promise<{ id: string; status: string } | null> {
  const candidatas = await db.abonoFalta.findMany({
    where: {
      userId,
      status: { in: status },
      dataInicio: { lte: new Date(`${periodo.dataFim}T00:00:00Z`) },
      dataFim: { gte: new Date(`${periodo.dataInicio}T00:00:00Z`) },
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true, status: true, dataInicio: true, dataFim: true, horaInicio: true, horaFim: true },
  });
  return (
    candidatas.find((c) =>
      sobrepoeAusencia(periodo, {
        dataInicio: ymd(c.dataInicio),
        dataFim: ymd(c.dataFim),
        horaInicio: c.horaInicio,
        horaFim: c.horaFim,
      }),
    ) ?? null
  );
}
