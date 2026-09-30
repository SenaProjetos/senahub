import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import {
  MOTIVO_PLANO_TRAVADO,
  impedimentoParaAbrirRevisao,
  impedimentoParaCancelarRevisao,
  planoTravado,
} from "./trava-plano";

/**
 * A guarda das mutações do PLANO (regra em `trava-plano.ts`). Recusa com a mesma frase que a tela mostra no item
 * desabilitado. Durante a revisão, deixa passar e marca que o plano mudou — é o que impede cancelar a revisão
 * depois de mexer (a mudança do combinado só fecha com a nova linha de base e o motivo).
 *
 * A marca vem ANTES da mutação: se ela falhar, a revisão fica marcada como alterada sem ter sido. Pessimista de
 * propósito — o contrário deixaria cancelar uma revisão que mudou o plano.
 */
export async function exigirPlanoEditavel(projetoId: string): Promise<void> {
  const c = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true, revisaoAlterada: true },
  });
  if (planoTravado(c)) throw new ActionError(MOTIVO_PLANO_TRAVADO);
  if (c?.emRevisao && !c.revisaoAlterada) {
    await prisma.cronogramaProjeto.update({ where: { projetoId }, data: { revisaoAlterada: true } });
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
  await prisma.cronogramaProjeto.update({
    where: { projetoId },
    data: { emRevisao: true, revisaoAbertaEm: new Date(), revisaoAlterada: false },
  });
}

/** Desiste da revisão que não mudou nada — o plano volta a travar como estava. */
export async function cancelarRevisao(projetoId: string): Promise<void> {
  const c = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true, revisaoAlterada: true },
  });
  const impedimento = impedimentoParaCancelarRevisao(c);
  if (impedimento) throw new ActionError(impedimento);
  await prisma.cronogramaProjeto.update({
    where: { projetoId },
    data: { emRevisao: false, revisaoAbertaEm: null, revisaoAlterada: false },
  });
}
