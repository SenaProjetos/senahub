import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaLocal } from "@/modules/ponto/engine";
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { motivoTarefaInvalida, tarefasDoPeriodo, type TarefaCandidata } from "@/modules/ponto/tarefa-ponto";

/**
 * Tarefa no ponto (F6 — D20), o lado com I/O de `tarefa-ponto.ts`.
 *
 * Aceita `tx` para validar DENTRO da transação da batida: a tarefa e o registro da batida
 * têm de sair juntos ou não sair.
 */
type Db = Prisma.TransactionClient | typeof prisma;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type TarefaDoPonto = { id: string; titulo: string; prazo: string | null };

/**
 * Lista curta que o ponto oferece: cards ABERTOS da pessoa no projeto, recortados pelo
 * período. Card de EAP só entra se a janela da linha cobre hoje (com folga) — o que a pessoa
 * está fazendo agora, nunca todas as tarefas do projeto.
 */
export async function tarefasParaPonto(userId: string, projetoId: string, hoje: string = diaLocal(new Date())): Promise<TarefaDoPonto[]> {
  const cards = await prisma.tarefa.findMany({
    where: {
      projetoId,
      arquivada: false,
      status: { concluido: false },
      responsaveis: { some: { userId } },
    },
    select: { id: true, titulo: true, prazo: true, eapTarefaId: true },
  });
  if (cards.length === 0) return [];

  const linhas = await prisma.eapTarefa.findMany({
    where: { id: { in: cards.map((c) => c.eapTarefaId).filter((id): id is string => id != null) } },
    select: { id: true, inicioPrevisto: true, fimPrevisto: true },
  });
  const janelaPorLinha = new Map(linhas.map((l) => [l.id, { inicio: iso(l.inicioPrevisto), fim: iso(l.fimPrevisto) }]));

  const candidatas: TarefaCandidata[] = cards.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    prazo: c.prazo ? iso(c.prazo) : null,
    // Card cuja linha da EAP foi apagada volta a ser card manual (`eapTarefaId` não tem FK).
    janela: c.eapTarefaId ? (janelaPorLinha.get(c.eapTarefaId) ?? null) : null,
  }));
  return tarefasDoPeriodo(candidatas, hoje).map((t) => ({ id: t.id, titulo: t.titulo, prazo: t.prazo }));
}

/**
 * Confere a tarefa escolhida contra a alocação da sessão que vai abrir e devolve o id a
 * gravar (ou `null`). Recusa com a mesma frase da tela quando não vale.
 *
 * Sem tarefa (`undefined`, `null` ou vazio) é o caso normal e nunca falha: o ponto não pode
 * virar burocracia.
 */
export async function resolverTarefaDoPonto(
  db: Db,
  userId: string,
  alocacao: { tipoAlocacao: TipoAlocacaoPonto; projetoId: string | null },
  tarefaId: string | null | undefined,
): Promise<string | null> {
  if (!tarefaId) return null;
  const tarefa = await db.tarefa.findUnique({
    where: { id: tarefaId },
    select: { projetoId: true, arquivada: true, responsaveis: { select: { userId: true } } },
  });
  const motivo = motivoTarefaInvalida(
    alocacao,
    tarefa ? { projetoId: tarefa.projetoId, arquivada: tarefa.arquivada, responsaveisIds: tarefa.responsaveis.map((r) => r.userId) } : null,
    userId,
  );
  if (motivo) throw new ActionError(motivo);
  return tarefaId;
}
