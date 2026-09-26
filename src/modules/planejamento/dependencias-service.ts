import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { criaCiclo } from "./ciclo-dependencias";

export type VinculoNovo = { predecessoraId: string; tipo: "fs" | "ss" | "ff" | "sf"; lagDias: number };

/**
 * Troca o CONJUNTO de predecessoras de uma linha: cria o que é novo, muda tipo e atraso do que ficou, tira o
 * que sumiu. É o que a célula Predecessoras do cronograma grava — uma transação, e quem chama reagenda UMA vez.
 *
 * Valida no servidor o que o texto da célula não consegue ver: linha citando a si mesma, predecessora repetida,
 * de outro projeto, e ciclo (`criaCiclo`, sobre o conjunto já trocado). Separado da action para o smoke
 * alcançar a regra sem sessão.
 */
export async function trocarPredecessoras(p: {
  tarefaId: string;
  vinculos: readonly VinculoNovo[];
}): Promise<{ projetoId: string; criadas: number; alteradas: number; removidas: number }> {
  const tarefa = await prisma.eapTarefa.findUnique({ where: { id: p.tarefaId }, select: { projetoId: true } });
  if (!tarefa) throw new ActionError("Tarefa não encontrada.");

  const ids = p.vinculos.map((v) => v.predecessoraId);
  if (new Set(ids).size !== ids.length) throw new ActionError("Há predecessoras repetidas.");
  if (ids.includes(p.tarefaId)) throw new ActionError("Tarefa não pode depender dela mesma.");
  if (ids.length > 0) {
    const dentro = await prisma.eapTarefa.count({ where: { id: { in: ids }, projetoId: tarefa.projetoId } });
    if (dentro !== ids.length) throw new ActionError("Dependência deve ser no mesmo projeto.");
  }

  const existentes = await prisma.eapDependencia.findMany({
    where: { tarefa: { projetoId: tarefa.projetoId } },
    select: { tarefaId: true, predecessoraId: true, tipo: true, lagDias: true },
  });
  if (criaCiclo(existentes, p.tarefaId, ids)) throw new ActionError("Dependência criaria um ciclo.");

  const atuais = new Map(existentes.filter((e) => e.tarefaId === p.tarefaId).map((e) => [e.predecessoraId, e]));
  let criadas = 0;
  let alteradas = 0;
  const sairam = [...atuais.keys()].filter((id) => !ids.includes(id));
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (sairam.length > 0) {
      await tx.eapDependencia.deleteMany({ where: { tarefaId: p.tarefaId, predecessoraId: { in: sairam } } });
    }
    for (const v of p.vinculos) {
      const ja = atuais.get(v.predecessoraId);
      if (!ja) {
        await tx.eapDependencia.create({
          data: { tarefaId: p.tarefaId, predecessoraId: v.predecessoraId, tipo: v.tipo, lagDias: v.lagDias },
        });
        criadas++;
      } else if (ja.tipo !== v.tipo || Number(ja.lagDias) !== v.lagDias) {
        await tx.eapDependencia.update({
          where: { tarefaId_predecessoraId: { tarefaId: p.tarefaId, predecessoraId: v.predecessoraId } },
          data: { tipo: v.tipo, lagDias: v.lagDias },
        });
        alteradas++;
      }
    }
  });
  return { projetoId: tarefa.projetoId, criadas, alteradas, removidas: sairam.length };
}
