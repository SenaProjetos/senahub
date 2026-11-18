import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sobrepoeAusencia, type ConflitoDeAusencia, type PeriodoAusencia } from "./abono-entrada";

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

/** Erro inesperado ao gravar a ausência (o atestado já foi apagado; nada ficou gravado). */
export const MOTIVO_AUSENCIA_NAO_REGISTRADA = "Não foi possível registrar a ausência. Tente de novo.";

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
 * Roda `fn` numa transação com as ausências e férias da pessoa travadas (`travarAusenciasDaPessoa`).
 * Todo caminho que grava ausência ou férias APROVADA (ou que confere sobreposição antes de gravar)
 * passa por aqui, para a conferência e a gravação não se intercalarem com outra da mesma pessoa.
 * Tempo esgotado chega como P2028 (`ehTempoEsgotado`): cada chamador escolhe a resposta.
 */
export async function comAusenciasTravadas<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await travarAusenciasDaPessoa(tx, userId);
    return fn(tx);
  }, OPCOES_TX_AUSENCIA);
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

/**
 * Férias da pessoa, com um dos `status`, que cruzam os dias `inicio`–`fim` (`YYYY-MM-DD`, fim
 * incluso). Com várias, a aprovada vem antes (é a que barra de vez). `excetoId` tira as próprias
 * férias quando quem confere é a aprovação ou a alteração delas.
 */
export async function feriasSobrepostas(
  db: Tx,
  userId: string,
  dias: { inicio: string; fim: string },
  status: ("pendente" | "aprovado")[],
  excetoId?: string,
): Promise<{ id: string; status: string } | null> {
  const achadas = await db.ferias.findMany({
    where: {
      userId,
      status: { in: status },
      inicio: { lte: new Date(`${dias.fim}T00:00:00Z`) },
      fim: { gte: new Date(`${dias.inicio}T00:00:00Z`) },
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true, status: true },
  });
  return achadas.find((f) => f.status === "aprovado") ?? achadas[0] ?? null;
}

/**
 * O que barra uma ausência no período: outra ausência com um dos `statusAusencia` (menos
 * `excetoId`) ou férias APROVADAS da pessoa (`ConflitoDeAusencia`). `null` = livre.
 */
export async function conflitoDaAusencia(
  db: Tx,
  userId: string,
  periodo: PeriodoAusencia,
  statusAusencia: ("pendente" | "aprovado")[],
  excetoId?: string,
): Promise<ConflitoDeAusencia | null> {
  const outra = await ausenciaSobreposta(db, userId, periodo, statusAusencia, excetoId);
  if (outra) return { tipo: "ausencia", status: outra.status };
  const ferias = await feriasSobrepostas(db, userId, { inicio: periodo.dataInicio, fim: periodo.dataFim }, ["aprovado"]);
  return ferias ? { tipo: "ferias" } : null;
}
