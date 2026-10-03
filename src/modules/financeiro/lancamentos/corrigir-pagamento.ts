import "server-only";

/**
 * Corrigir o pagamento de um lançamento JÁ pago (M8): trocar a conta, a forma de pagamento ou a data em
 * que foi pago, sem estornar (estornar devolveria o lançamento ao aberto e se perderia o resto). Valor,
 * categoria e projeto não mudam por aqui — esses são do formulário de edição.
 */
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { exigirOperacao, MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";

export const MOTIVO_CONCILIADO_CONTA_E_DATA =
  "Conciliado com o extrato: a conta e a data do pagamento não mudam — desconcilie a transação antes. A forma de pagamento pode.";
export const MOTIVO_DATA_FUTURA = "A data do pagamento não pode ser depois de hoje.";
export const MOTIVO_SEM_CONTA = "Escolha a conta em que o pagamento caiu.";
export const MOTIVO_NADA_MUDOU = "Nada mudou: troque a conta, a forma ou a data do pagamento.";

export type CorrecaoDePagamento = {
  id: string;
  contaId: string;
  formaId: string | null;
  /** `YYYY-MM-DD`. */
  dataConfirmacao: string;
};

export type Mudanca = "conta" | "forma" | "data";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function corrigirPagamentoNoBanco(i: CorrecaoDePagamento): Promise<{ mudou: Mudanca[] }> {
  if (!i.contaId) throw new ActionError(MOTIVO_SEM_CONTA);
  if (i.dataConfirmacao > diaDeSaoPaulo()) throw new ActionError(MOTIVO_DATA_FUTURA);
  return prisma.$transaction(async (tx) => {
    const { estado } = await exigirOperacao(tx, i.id, "corrigir_pagamento");
    const l = await tx.lancamento.findUniqueOrThrow({
      where: { id: i.id },
      select: { contaId: true, formaId: true, dataConfirmacao: true },
    });
    const mudou: Mudanca[] = [];
    if (l.contaId !== i.contaId) mudou.push("conta");
    if ((l.formaId ?? null) !== (i.formaId ?? null)) mudou.push("forma");
    if (dia(l.dataConfirmacao) !== i.dataConfirmacao) mudou.push("data");
    if (mudou.length === 0) throw new ActionError(MOTIVO_NADA_MUDOU);

    // O extrato do banco já registrou o movimento naquela conta e naquele dia.
    if (estado.conciliado && (mudou.includes("conta") || mudou.includes("data"))) {
      throw new ActionError(MOTIVO_CONCILIADO_CONTA_E_DATA);
    }
    const conta = await tx.contaBancaria.findUnique({ where: { id: i.contaId }, select: { ativo: true } });
    if (!conta?.ativo) throw new ActionError("A conta escolhida não existe ou está inativa.");
    if (i.formaId) {
      const f = await tx.formaPagamento.count({ where: { id: i.formaId } });
      if (!f) throw new ActionError("Forma de pagamento não encontrada.");
    }
    // N5: conta e data são dados travados pelo mês fechado; a forma de pagamento não é.
    if (mudou.includes("conta") || mudou.includes("data")) {
      await exigirPeriodoAberto(tx, [l.dataConfirmacao, new Date(`${i.dataConfirmacao}T00:00:00.000Z`)]);
    }
    const r = await tx.lancamento.updateMany({
      where: { id: i.id, status: "confirmado", excluidoEm: null },
      data: { contaId: i.contaId, formaId: i.formaId, dataConfirmacao: new Date(`${i.dataConfirmacao}T00:00:00.000Z`) },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    // M7: juros/multa/desconto da baixa saíram da mesma conta, no mesmo dia, pela mesma forma.
    await tx.lancamento.updateMany({
      where: { acessorioDeId: i.id, excluidoEm: null },
      data: { contaId: i.contaId, formaId: i.formaId, dataConfirmacao: new Date(`${i.dataConfirmacao}T00:00:00.000Z`) },
    });
    return { mudou };
  });
}
