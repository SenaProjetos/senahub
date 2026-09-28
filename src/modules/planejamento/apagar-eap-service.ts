import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { impedimentoParaApagarEap, type SituacaoParaApagar } from "./apagar-eap";

type Db = Prisma.TransactionClient | typeof prisma;

/** O que se pendura na EAP do projeto — a regra do que pode está em `apagar-eap.ts`. Consultas uma de cada vez: roda na transação. */
export async function situacaoParaApagarEap(projetoId: string, db: Db = prisma): Promise<SituacaoParaApagar> {
  const linhas = await db.eapTarefa.findMany({
    where: { projetoId },
    select: { id: true, progresso: true, inicioReal: true, fimReal: true },
  });
  const ids = linhas.map((l) => l.id);
  const baseline = await db.eapBaseline.count({ where: { projetoId } });
  const cronograma = await db.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true } });
  const comHistorico = ids.length
    ? await db.eapProgressoRegistro.findMany({ where: { tarefaId: { in: ids } }, select: { tarefaId: true }, distinct: ["tarefaId"] })
    : [];
  const cards = ids.length ? await db.tarefa.count({ where: { eapTarefaId: { in: ids } } }) : 0;
  const parcelas = ids.length ? await db.contratoParcelaEntrega.count({ where: { marcoId: { in: ids } } }) : 0;

  const andamento = new Set(comHistorico.map((h) => h.tarefaId));
  for (const l of linhas) if (Number(l.progresso) > 0 || l.inicioReal || l.fimReal) andamento.add(l.id);

  return {
    linhas: linhas.length,
    temLinhaDeBase: baseline > 0,
    cronogramaAprovado: cronograma?.aprovado ?? false,
    comAndamento: andamento.size,
    cards,
    parcelasDeContrato: parcelas,
  };
}

/** Por que o botão "Apagar EAP" fica desabilitado (`null` = pode). A tela e a action usam a mesma frase. */
export async function impedimentoParaApagarEapDoProjeto(projetoId: string): Promise<string | null> {
  return impedimentoParaApagarEap(await situacaoParaApagarEap(projetoId));
}

/**
 * Apaga TODAS as linhas da EAP do projeto (as subtarefas, os vínculos, as pessoas atribuídas e o histórico de código vão
 * junto, por cascata) para recomeçar com outro modelo. Revalida dentro da transação: entre abrir a tela e clicar, alguém
 * pode ter aprovado o cronograma. Ficam as fases cadastradas nas disciplinas (mexem em pagamento) e o cronograma (a
 * âncora e a Data de Status). Quem reagenda é quem chama.
 */
export async function apagarEapDoProjeto(projetoId: string): Promise<{ apagadas: number }> {
  return prisma.$transaction(async (tx) => {
    const motivo = impedimentoParaApagarEap(await situacaoParaApagarEap(projetoId, tx));
    if (motivo) throw new ActionError(motivo);
    const r = await tx.eapTarefa.deleteMany({ where: { projetoId } });
    return { apagadas: r.count };
  });
}
