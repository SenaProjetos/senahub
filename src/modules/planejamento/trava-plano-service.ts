import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import {
  MOTIVO_JA_EM_REVISAO,
  MOTIVO_PLANO_TRAVADO,
  impedimentoParaAbrirRevisao,
  impedimentoParaCancelarRevisao,
  planoTravado,
} from "./trava-plano";

type Db = Prisma.TransactionClient | typeof prisma;

/** A frase quando a revisão mudou entre a tela e o clique e o estado de agora não explica sozinho. */
export const MOTIVO_REVISAO_MUDOU = "O estado da revisão mudou enquanto você decidia; recarregue a página e confira.";

/**
 * Só a recusa da guarda, sem marcar nada: para recusar cedo (antes de validar o resto) quando a marca vai para dentro da
 * transação da mutação, com `exigirPlanoEditavel(projetoId, tx)`.
 */
export async function recusarSePlanoTravado(projetoId: string, db: Db = prisma): Promise<void> {
  const c = await db.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true, emRevisao: true } });
  if (planoTravado(c)) throw new ActionError(MOTIVO_PLANO_TRAVADO);
}

/**
 * A guarda das mutações do PLANO (regra em `trava-plano.ts`). Recusa com a mesma frase que a tela mostra no item
 * desabilitado. Durante a revisão, deixa passar e marca que o plano mudou — é o que impede cancelar a revisão
 * depois de mexer (a mudança do combinado só fecha com a nova linha de base e o motivo).
 *
 * A marca é um `updateMany` condicionado a `emRevisao`: se a revisão foi cancelada ou fechada entre a leitura e aqui, o
 * plano travou de novo e a guarda recusa, em vez de marcar uma revisão que já não existe e deixar a mutação passar.
 *
 * Com `db` = a transação da mutação, a marca vai junto com ela: uma recusa no meio (a contagem da propagação, por
 * exemplo) desfaz também a marca, e o cancelamento da revisão espera a transação terminar. Fora de transação, a
 * marca vem ANTES da mutação: se ela falhar, a revisão fica marcada como alterada sem ter sido. Pessimista de
 * propósito — o contrário deixaria cancelar uma revisão que mudou o plano.
 */
export async function exigirPlanoEditavel(projetoId: string, db: Db = prisma): Promise<void> {
  const c = await db.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true, revisaoAlterada: true },
  });
  if (planoTravado(c)) throw new ActionError(MOTIVO_PLANO_TRAVADO);
  if (c?.emRevisao && !c.revisaoAlterada) {
    const r = await db.cronogramaProjeto.updateMany({ where: { projetoId, emRevisao: true }, data: { revisaoAlterada: true } });
    if (r.count !== 1) throw new ActionError(MOTIVO_PLANO_TRAVADO);
  }
}

/** A mesma guarda, a partir de uma linha da EAP. Devolve o projeto da linha. */
export async function exigirPlanoEditavelDaLinha(tarefaId: string): Promise<string> {
  const t = await prisma.eapTarefa.findUnique({ where: { id: tarefaId }, select: { projetoId: true } });
  if (!t) throw new ActionError("Tarefa não encontrada.");
  await exigirPlanoEditavel(t.projetoId);
  return t.projetoId;
}

/** "Revisar planejamento": destrava o plano até a próxima linha de base. */
export async function abrirRevisao(projetoId: string): Promise<void> {
  const c = await prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true, emRevisao: true } });
  const impedimento = impedimentoParaAbrirRevisao(c);
  if (impedimento) throw new ActionError(impedimento);
  // Condicionado ao estado lido: dois cliques (ou duas pessoas) abrem a revisão uma vez só.
  const r = await prisma.cronogramaProjeto.updateMany({
    where: { projetoId, aprovado: true, emRevisao: false },
    data: { emRevisao: true, revisaoAbertaEm: new Date(), revisaoAlterada: false },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_JA_EM_REVISAO);
}

/**
 * Desiste da revisão que não mudou nada — o plano volta a travar como estava.
 *
 * A gravação é condicionada a "em revisão e sem mudança": uma edição que marcou o plano entre a leitura e o clique
 * (ou uma nova linha de base que fechou a revisão) faz o cancelamento recusar, em vez de travar de novo um plano que
 * mudou sem deixar a linha de base com o motivo.
 */
export async function cancelarRevisao(projetoId: string): Promise<void> {
  const c = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true, revisaoAlterada: true },
  });
  const impedimento = impedimentoParaCancelarRevisao(c);
  if (impedimento) throw new ActionError(impedimento);
  const r = await prisma.cronogramaProjeto.updateMany({
    where: { projetoId, aprovado: true, emRevisao: true, revisaoAlterada: false },
    data: { emRevisao: false, revisaoAbertaEm: null, revisaoAlterada: false },
  });
  if (r.count === 1) return;
  // Mudou entre a leitura e a gravação: a frase sai do estado de agora.
  const agora = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true, revisaoAlterada: true },
  });
  throw new ActionError(impedimentoParaCancelarRevisao(agora) ?? MOTIVO_REVISAO_MUDOU);
}
