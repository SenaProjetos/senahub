import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaLocal } from "@/modules/ponto/engine";
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { listaDoPonto, motivoTarefaInvalida, sugestaoDoPonto, type TarefaCandidata } from "@/modules/ponto/tarefa-ponto";

/**
 * Tarefa no ponto (F6 — D20), o lado com I/O de `tarefa-ponto.ts`.
 *
 * Aceita `tx` para validar DENTRO da transação da batida: a tarefa e o registro da batida
 * têm de sair juntos ou não sair.
 */
type Db = Prisma.TransactionClient | typeof prisma;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type TarefaDoPonto = {
  id: string;
  titulo: string;
  prazo: string | null;
  /** Término da linha passou e o card segue aberto. */
  atrasada: boolean;
  /** `periodo` = lista curta; `etapa` = recolhida em "outras da etapa". */
  grupo: "periodo" | "etapa";
};

/** Para onde o ponto abre quando não há sessão: o projeto e a atividade de hoje no cronograma. */
export type SugestaoDoPonto = {
  projeto: { id: string; codigo: string; nome: string };
  tarefa: { id: string; titulo: string };
};

/** Cards ABERTOS da pessoa (de um projeto ou de todos), já com a janela e a etapa da linha da EAP. */
export async function candidatasDaPessoa(userId: string, projetoId?: string) {
  const cards = await prisma.tarefa.findMany({
    where: {
      ...(projetoId ? { projetoId } : { projetoId: { not: null } }),
      arquivada: false,
      status: { concluido: false },
      responsaveis: { some: { userId } },
      // Projeto parado, concluído ou arquivado não tem "atividade de hoje".
      projeto: { situacao: "em_andamento" },
    },
    select: {
      id: true,
      titulo: true,
      prazo: true,
      eapTarefaId: true,
      projeto: { select: { id: true, codigo: true, nome: true } },
    },
  });
  if (cards.length === 0) return [];

  const linhas = await prisma.eapTarefa.findMany({
    where: { id: { in: cards.map((c) => c.eapTarefaId).filter((id): id is string => id != null) } },
    select: { id: true, inicioPrevisto: true, fimPrevisto: true, disciplinaId: true, etapaId: true },
  });
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));

  return cards.map((c) => {
    // Card cuja linha da EAP foi apagada volta a ser card manual (`eapTarefaId` não tem FK).
    const l = c.eapTarefaId ? linhaPorId.get(c.eapTarefaId) : undefined;
    return {
      id: c.id,
      titulo: c.titulo,
      prazo: c.prazo ? iso(c.prazo) : null,
      janela: l ? { inicio: iso(l.inicioPrevisto), fim: iso(l.fimPrevisto) } : null,
      etapa: l?.disciplinaId && l.etapaId ? `${l.disciplinaId}:${l.etapaId}` : null,
      projeto: c.projeto,
    } satisfies TarefaCandidata & { projeto: unknown };
  });
}

/**
 * Lista que o ponto oferece: cards ABERTOS da pessoa no projeto, recortados pelo período (com a
 * atrasada que nunca some) e, recolhidas, as "outras da etapa" — nunca todas as tarefas do projeto.
 */
export async function tarefasParaPonto(userId: string, projetoId: string, hoje: string = diaLocal(new Date())): Promise<TarefaDoPonto[]> {
  const candidatas = await candidatasDaPessoa(userId, projetoId);
  return listaDoPonto(candidatas, hoje).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    prazo: t.prazo,
    atrasada: t.atrasada,
    grupo: t.grupo,
  }));
}

/**
 * Sugestão para o ponto parado (`sugestaoDoPonto`), só entre os projetos que o seletor oferece
 * (`projetoIds`) — senão o ponto abriria num projeto que a pessoa não consegue escolher.
 */
export async function sugestaoParaPonto(
  userId: string,
  projetoIds: ReadonlySet<string>,
  hoje: string = diaLocal(new Date()),
): Promise<SugestaoDoPonto | null> {
  if (projetoIds.size === 0) return null;
  const candidatas = (await candidatasDaPessoa(userId))
    .filter((c) => c.projeto && projetoIds.has(c.projeto.id))
    .map((c) => ({ ...c, projetoId: c.projeto!.id }));
  const s = sugestaoDoPonto(candidatas, hoje);
  return s && s.projeto ? { projeto: s.projeto, tarefa: { id: s.id, titulo: s.titulo } } : null;
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
