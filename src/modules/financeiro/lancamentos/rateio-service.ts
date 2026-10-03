import "server-only";

/** Rateio de um lançamento entre centros/projetos (M10): leitura e gravação. Regras puras em `rateio.ts`. */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { datasDoLancamento, exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { MOTIVO_ACESSORIO, MOTIVO_CANCELADO_REABRA, MOTIVO_EXCLUIDO, MOTIVO_PREVISAO_CRONOGRAMA, MOTIVO_TRANSFERENCIA } from "@/modules/financeiro/lancamentos/transicoes";
import { validarRateio, type ItemRateio } from "@/modules/financeiro/lancamentos/rateio";

type Tx = Prisma.TransactionClient;

export async function lerRateio(lancamentoId: string): Promise<ItemRateio[]> {
  return prisma.rateioLancamento.findMany({
    where: { lancamentoId },
    select: { centroId: true, projetoId: true, percentualBp: true },
  });
}

/**
 * Substitui todo o rateio do lançamento (delete+create numa transação). Lista vazia = remove o rateio.
 * Rateio muda o centro/projeto do Relatório por dimensão, então segue as mesmas travas de editar centro/projeto:
 * mês fechado não muda (N5), e não se rateia perna de transferência, juros/desconto de baixa, cancelado nem
 * previsão do cronograma.
 */
export async function salvarRateioNoBanco(lancamentoId: string, itens: readonly ItemRateio[]): Promise<void> {
  if (itens.length > 0) {
    const erro = validarRateio(itens);
    if (erro) throw new ActionError(erro);
  }
  await prisma.$transaction(async (tx) => {
    // `findUnique` vê o excluído (a extensão só filtra listas): o excluído é recusado, não "não encontrado".
    const l = await tx.lancamento.findUnique({
      where: { id: lancamentoId },
      select: { status: true, excluidoEm: true, transferenciaId: true, acessorioDeId: true, data: true, dataCompetencia: true, dataConfirmacao: true },
    });
    if (!l) throw new ActionError("Lançamento não encontrado.");
    if (l.excluidoEm) throw new ActionError(MOTIVO_EXCLUIDO);
    if (l.status === "previsao") throw new ActionError(MOTIVO_PREVISAO_CRONOGRAMA);
    if (l.status === "cancelado") throw new ActionError(MOTIVO_CANCELADO_REABRA);
    if (l.transferenciaId) throw new ActionError(MOTIVO_TRANSFERENCIA);
    if (l.acessorioDeId) throw new ActionError(MOTIVO_ACESSORIO);
    await exigirPeriodoAberto(tx, datasDoLancamento(l));
    await tx.rateioLancamento.deleteMany({ where: { lancamentoId } });
    if (itens.length > 0) {
      await tx.rateioLancamento.createMany({
        data: itens.map((i) => ({ lancamentoId, centroId: i.centroId, projetoId: i.projetoId, percentualBp: i.percentualBp })),
      });
    }
  });
}

/**
 * Copia o rateio de um lançamento para outro que nasceu dele — o saldo de um pagamento parcial e os juros/multa/
 * desconto da baixa. Sem isso o pedaço novo cairia inteiro no centro/projeto principal do Relatório por dimensão.
 */
export async function copiarRateioNoTx(tx: Tx, deId: string, paraId: string): Promise<void> {
  const linhas = await tx.rateioLancamento.findMany({ where: { lancamentoId: deId }, select: { centroId: true, projetoId: true, percentualBp: true } });
  if (linhas.length === 0) return;
  await tx.rateioLancamento.createMany({ data: linhas.map((r) => ({ ...r, lancamentoId: paraId })) });
}
