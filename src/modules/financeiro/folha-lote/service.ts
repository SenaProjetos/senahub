/**
 * Regras do lote mensal de produção (`FolhaProjetista`). Nada aqui importa o `prisma`:
 *
 * - `resumirLotes` é pura — só dados, testável sem banco;
 * - `recalcularTotalFolha` faz I/O, mas SÓ pelo `tx` que recebe: nunca importa o client e
 *   nunca abre transação própria. Quem chama já está numa `$transaction`, e o total precisa
 *   ser gravado nela — fora dela, um cancelamento que falhasse depois deixaria o total do
 *   lote recalculado como se tivesse dado certo. Não "simplificar" importando o client.
 */
import type { Prisma } from "@/generated/prisma/client";

/**
 * `FolhaProjetista.total` é agregado GRAVADO: soma dos pagamentos do lote que não estão
 * cancelados (pagos + pendentes, inclusive os de R$ 0,00). Fonte única — eram três cópias
 * (D22): editar/cancelar na folha, gerar lote e a sincronização de pagamentos da disciplina.
 */
export async function recalcularTotalFolha(tx: Prisma.TransactionClient, folhaId: string) {
  const agg = await tx.pagamentoProjetista.aggregate({
    where: { folhaId, status: { not: "cancelado" } },
    _sum: { valor: true },
  });
  await tx.folhaProjetista.update({ where: { id: folhaId }, data: { total: agg._sum.valor ?? 0 } });
}

type LinhaPorStatus = { folhaId: string | null; status: string; _count: { _all: number } };
type LinhaPorFolha = { folhaId: string | null; _count: { _all: number } };

export type ResumoLote = {
  qtd: number;
  pagos: number;
  todosPagos: boolean;
  /** Pendentes com R$ 0,00 — ficam de fora do "Pagar lote" (F0a). */
  semValor: number;
  /** Pendentes com valor — o que o "Pagar lote" efetiva; 0 esconde o botão. */
  pagaveis: number;
};

export const RESUMO_LOTE_VAZIO: ResumoLote = { qtd: 0, pagos: 0, todosPagos: false, semValor: 0, pagaveis: 0 };

/**
 * Junta os dois `groupBy` de `listarFolhasProjetista` (contagem por lote × status, e
 * pendentes zerados por lote) num resumo por lote. Linha de `groupBy` sem `folhaId`
 * (pagamento fora de lote) é ignorada. Lote sem linha nenhuma não entra no mapa — o
 * chamador usa `RESUMO_LOTE_VAZIO`.
 */
export function resumirLotes(porStatus: LinhaPorStatus[], semValorPorFolha: LinhaPorFolha[]): Map<string, ResumoLote> {
  const contagens = new Map<string, Record<string, number>>();
  for (const r of porStatus) {
    if (!r.folhaId) continue;
    const c = contagens.get(r.folhaId) ?? {};
    c[r.status] = (c[r.status] ?? 0) + r._count._all;
    contagens.set(r.folhaId, c);
  }
  const semValorMap = new Map<string, number>();
  for (const r of semValorPorFolha) if (r.folhaId) semValorMap.set(r.folhaId, r._count._all);

  const resumo = new Map<string, ResumoLote>();
  for (const [folhaId, c] of contagens) {
    const qtd = Object.values(c).reduce((s, n) => s + n, 0);
    const pagos = c.pago ?? 0;
    const semValor = semValorMap.get(folhaId) ?? 0;
    resumo.set(folhaId, {
      qtd,
      pagos,
      todosPagos: qtd > 0 && pagos === qtd,
      semValor,
      // Os zerados são um subconjunto dos pendentes (mesmo `where` + `valor <= 0`); o piso
      // em 0 só impede que uma contagem inconsistente vire botão com número negativo.
      pagaveis: Math.max(0, (c.pendente ?? 0) - semValor),
    });
  }
  return resumo;
}

/**
 * Mover um pagamento de lote (G3/B5, decisão N8). Pura — a tela usa a mesma regra para
 * esconder a ação em vez de oferecer algo que a action vai recusar.
 *
 * **Só pendente** (N8): pagamento pago fica onde está. Mover um pago reescreveria a
 * composição de um lote já fechado no caixa — o lote é o agrupamento do que foi pago
 * naquele mês, e o extrato já registrou a saída.
 *
 * Lote destino `paga` também não recebe: ele já foi dado como pago por inteiro, e um
 * pendente dentro dele faria "3/3 pagos" virar mentira na própria linha.
 */
export function erroMoverLote(
  statusPagamento: string,
  origemId: string | null,
  destino: { id: string; status: string } | null,
): string | null {
  if (statusPagamento !== "pendente") {
    return "Só pagamento pendente muda de lote — um pagamento já efetivado fica no lote em que foi pago.";
  }
  if ((destino?.id ?? null) === origemId) return "Este pagamento já está neste lote.";
  if (destino?.status === "paga") {
    return "Este lote já foi pago por inteiro — não dá para mover um pendente para dentro dele.";
  }
  return null;
}
