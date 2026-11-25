import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Reserva de envio do resumo diário do portal (`AvisoPortalEnviado`, chave única conta + projeto + dia + canal). Compartilhada
 * pelo resumo do cliente (`resumo-service.ts`) e pelo de obra (`obra/resumo-service.ts`): a mesma regra de "uma vez só".
 */
export type CanalResumo = "email" | "sino";

const dataDoDia = (d: string) => new Date(`${d}T00:00:00.000Z`);

/**
 * Reserva uma linha por dia e devolve os dias que ficaram com ESTA rodada. Dia já reservado (P2002 — outra rodada,
 * ou uma rodada anterior que caiu no meio) fica de fora sem segurar os outros: o dia novo sai mesmo assim.
 * Queda do processo entre a reserva e o envio perde aquele envio (uma vez, sem repetir) — escolha consciente.
 */
export async function reservarAvisoPortal(
  userId: string,
  projetoId: string,
  dias: readonly string[],
  canal: CanalResumo,
): Promise<string[]> {
  const meus: string[] = [];
  for (const d of dias) {
    try {
      await prisma.avisoPortalEnviado.create({ data: { userId, projetoId, dia: dataDoDia(d), canal } });
      meus.push(d);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return meus;
}

/** Devolve a reserva quando o envio falhou (o e-mail não saiu, o sino lançou). */
export async function liberarAvisoPortal(userId: string, projetoId: string, dias: readonly string[], canal: CanalResumo): Promise<void> {
  if (dias.length === 0) return;
  await prisma.avisoPortalEnviado.deleteMany({ where: { userId, projetoId, canal, dia: { in: dias.map(dataDoDia) } } });
}
