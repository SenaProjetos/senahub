import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Dia } from "@/lib/calendario-trabalho";
import { paraDataUtc, paraDia, planoDoProjeto } from "./agenda";
import { duracaoPeloTermino, moverRestricoes } from "./datas-linha";

/**
 * Datas digitadas na tabela da EAP (I/O sobre `datas-linha.ts`). O INÍCIO vira a restrição "não iniciar antes de" (o
 * alfinete), o TÉRMINO vira a duração, e o início do PROJETO pode levar as restrições junto ("mover junto"). Quem chama
 * reagenda (`aposMudarEap`); separado da action para o smoke alcançar a regra sem sessão.
 */

export const MOTIVO_DATA_DE_AGRUPAMENTO = "Agrupamento: o início e o término vêm das tarefas de dentro.";
export const MOTIVO_MARCO_SEM_TERMINO = "Marco não tem término: ele é uma data só. Mude o início.";

async function carregarLinha(id: string) {
  const t = await prisma.eapTarefa.findUnique({ where: { id }, select: { projetoId: true, tipoEap: true, _count: { select: { filhas: true } } } });
  if (!t) throw new ActionError("Tarefa não encontrada.");
  if (t._count.filhas > 0) throw new ActionError(MOTIVO_DATA_DE_AGRUPAMENTO);
  return t;
}

/** O início digitado: grava a restrição "não iniciar antes de" (no lugar da que a linha tivesse); a duração se mantém. */
export async function definirInicioDaLinha(p: { id: string; data: Dia }): Promise<{ projetoId: string }> {
  const t = await carregarLinha(p.id);
  await prisma.eapTarefa.update({ where: { id: p.id }, data: { restricaoTipo: "iniciar_nao_antes_de", restricaoData: paraDataUtc(p.data) } });
  return { projetoId: t.projetoId };
}

/** O término digitado: a duração em dias úteis do início do MOTOR até a data; não cria restrição. */
export async function definirTerminoDaLinha(p: { id: string; data: Dia }): Promise<{ projetoId: string; duracaoDias: number }> {
  const t = await carregarLinha(p.id);
  if (t.tipoEap === "mrc") throw new ActionError(MOTIVO_MARCO_SEM_TERMINO);
  const plano = await planoDoProjeto(t.projetoId);
  const linha = plano?.resultado.linhas.get(p.id);
  if (!plano || !linha) throw new ActionError("Não foi possível calcular o início desta tarefa. Reagende o projeto e tente de novo.");
  const r = duracaoPeloTermino({ inicio: linha.inicio, fim: p.data, cal: plano.calendario });
  if (!r.ok) throw new ActionError(r.motivo);
  await prisma.eapTarefa.update({ where: { id: p.id }, data: { duracaoDias: r.dias } });
  return { projetoId: t.projetoId, duracaoDias: r.dias };
}

/**
 * "Mover junto": o início do projeto andou de `de` para `para`; cada `restricaoData` do projeto anda os mesmos dias úteis.
 * `de` nulo (projeto sem início anterior) não tem o que deslocar. Chame DEPOIS de gravar o novo início.
 */
export async function moverRestricoesDoProjeto(projetoId: string, de: Dia | null, para: Dia): Promise<{ movidas: number }> {
  if (!de) return { movidas: 0 };
  const plano = await planoDoProjeto(projetoId);
  if (!plano) return { movidas: 0 };
  const linhas = await prisma.eapTarefa.findMany({ where: { projetoId, restricaoData: { not: null } }, select: { id: true, restricaoData: true } });
  const novas = moverRestricoes(
    linhas.map((l) => ({ id: l.id, restricaoData: l.restricaoData ? paraDia(l.restricaoData) : null })),
    de,
    para,
    plano.calendario,
  );
  if (novas.length === 0) return { movidas: 0 };
  await prisma.$transaction(async (tx) => {
    for (const n of novas) await tx.eapTarefa.update({ where: { id: n.id }, data: { restricaoData: paraDataUtc(n.restricaoData) } });
  });
  return { movidas: novas.length };
}
