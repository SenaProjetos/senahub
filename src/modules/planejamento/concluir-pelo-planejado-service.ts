import "server-only";
import type { Prisma, StatusEap } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { paraDataUtc, paraDia } from "./agenda";
import { concluiPeloPercentual, datasPeloPlanejado, type OrigemDasDatas } from "./concluir-pelo-planejado";

type Dia = string;

/** O que a célula do % e o painel da linha sabem para concluir pelo planejado (vem da action). */
export type OpcoesDoPercentual = { hoje: Dia; podeExecucao: boolean };

export type ConclusaoPeloPlanejado = { origem: OrigemDasDatas; inicioReal: Dia; fimReal: Dia };

/** Campos da linha que a regra lê — selecione `SELECT_CONCLUSAO` no `findUnique`. */
export const SELECT_CONCLUSAO = {
  tipoEap: true,
  status: true,
  progresso: true,
  inicioReal: true,
  fimReal: true,
  inicioBaseline: true,
  fimBaseline: true,
  inicioPrevisto: true,
  fimPrevisto: true,
} as const;

export type LinhaParaConclusao = {
  tipoEap: string;
  status: StatusEap;
  progresso: number;
  inicioReal: Date | null;
  fimReal: Date | null;
  inicioBaseline: Date | null;
  fimBaseline: Date | null;
  inicioPrevisto: Date | null;
  fimPrevisto: Date | null;
};

const dia = (d: Date | null) => (d ? paraDia(d) : null);

/**
 * O % `novo` conclui a linha pelo planejado? Devolve as datas a gravar, ou `null` (o % grava sozinho, como antes). Datas
 * reais são da permissão `cronograma:executado`: sem ela, nunca.
 */
export function conclusaoDoPercentual(
  l: LinhaParaConclusao,
  ehResumo: boolean,
  novo: number,
  opcoes: OpcoesDoPercentual | undefined,
): ConclusaoPeloPlanejado | null {
  if (!opcoes?.podeExecucao) return null;
  if (!concluiPeloPercentual({ tipoEap: l.tipoEap, ehResumo, status: l.status, progresso: l.progresso, fimReal: dia(l.fimReal) }, novo)) {
    return null;
  }
  const d = datasPeloPlanejado(
    {
      inicioReal: dia(l.inicioReal),
      inicioBaseline: dia(l.inicioBaseline),
      fimBaseline: dia(l.fimBaseline),
      inicioPrevisto: dia(l.inicioPrevisto),
      fimPrevisto: dia(l.fimPrevisto),
    },
    opcoes.hoje,
  );
  return d;
}

/**
 * Grava as datas reais e o status concluída, condicionado ao estado lido (outra gravação no meio = recusa, a transação
 * desfaz o % junto), com a trilha na mesma transação. O % é de quem chama (ele já grava o histórico do %).
 */
export async function concluirPeloPlanejadoNoTx(
  tx: Prisma.TransactionClient,
  id: string,
  antes: { status: StatusEap; inicioReal: Date | null },
  c: ConclusaoPeloPlanejado,
  autorId: string | null,
  acao = "concluir-pelo-planejado",
): Promise<void> {
  const g = await tx.eapTarefa.updateMany({
    where: { id, status: antes.status, fimReal: null, inicioReal: antes.inicioReal },
    data: { inicioReal: paraDataUtc(c.inicioReal), fimReal: paraDataUtc(c.fimReal), status: "con" },
  });
  if (g.count !== 1) throw new ActionError("A tarefa mudou enquanto você editava. Atualize a tela e tente de novo.");
  await tx.auditLog.create({
    data: {
      userId: autorId,
      modulo: "planejamento",
      acao,
      entidade: "EapTarefa",
      entidadeId: id,
      detalhe: {
        antes: { status: antes.status, inicioReal: dia(antes.inicioReal), fimReal: null },
        novo: {
          status: "con",
          inicioReal: c.inicioReal,
          fimReal: c.fimReal,
          origem: c.origem === "linha_base" ? "100% sem datas: linha de base" : "100% sem datas: datas previstas",
        },
      },
    },
  });
}
