import "server-only";

/**
 * I/O da máquina de situações do lançamento (N1): a mesma leitura de estado em toda ação, o estorno
 * (pago → em aberto) e a reabertura (cancelado → em aberto). As regras são de `transicoes.ts`, puras;
 * aqui fica o que só o banco garante: gravação condicionada à situação lida (duas pessoas ao mesmo
 * tempo não estornam duas vezes), o resto do parcial e a distribuição entre caixinhas desfeitos
 * junto, e o histórico de situação. Separado das actions para o smoke alcançar sem sessão.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { datasDoLancamento, exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import {
  estadoDoLancamento,
  motivoParaNao,
  situacaoDepois,
  type Operacao,
} from "@/modules/financeiro/lancamentos/transicoes";

type Db = Prisma.TransactionClient | typeof prisma;

const MARCA_RESTANTE = "Saldo restante de pagamento parcial";
export const MOTIVO_MUDOU = "O lançamento mudou enquanto a tela estava aberta: atualize e tente de novo.";

/**
 * Lê o lançamento com o que a máquina de situações precisa. `findUnique` não passa pelo filtro de
 * excluídos (lib/prisma.ts): o excluído volta, e `motivoParaNao` o recusa (A12).
 */
export async function lerParaOperacao(db: Db, id: string) {
  const l = await db.lancamento.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      status: true,
      valor: true,
      valorEfetivo: true,
      excluidoEm: true,
      motivoRejeicao: true,
      pagamentoProjetistaId: true,
      recorrenciaGrupo: true,
      transferenciaId: true,
      data: true,
      dataCompetencia: true,
      dataConfirmacao: true,
      transacao: { select: { id: true, valor: true } },
      distribuicao: { select: { id: true } },
    },
  });
  if (!l) throw new ActionError("Lançamento não encontrado.");
  const art = await db.art.count({ where: { OR: [{ lancamentoId: id }, { reembolsoLancamentoId: id }] } });
  // M8: perna de transferência só se trata como par quando a outra perna existe.
  const par = l.transferenciaId
    ? await db.lancamento.count({ where: { transferenciaId: l.transferenciaId, id: { not: id }, excluidoEm: null } })
    : 0;
  const estado = estadoDoLancamento({ ...l, ehDeArt: art > 0, parDeTransferencia: par > 0 });
  return { lancamento: l, estado };
}

/** Lê e recusa com a frase da regra quando a operação não pode acontecer. */
export async function exigirOperacao(db: Db, id: string, op: Operacao) {
  const r = await lerParaOperacao(db, id);
  const motivo = motivoParaNao(op, r.estado);
  if (motivo) throw new ActionError(motivo);
  return r;
}

export type ResultadoEstorno = {
  /** Resto de baixa parcial que estava em aberto e saiu junto. */
  restantesExcluidos: number;
  distribuicaoDesfeita: boolean;
  aviso: string | null;
};

/**
 * Estorna um lançamento pago: volta a em aberto, sem data nem valor pagos. Baixa parcial leva junto
 * o resto ainda em aberto (o pago volta ao valor cheio — sem isso o mês contaria o resto duas vezes);
 * resto já pago impede. Receita distribuída tem a distribuição desfeita (os movimentos de alocação
 * saem das caixinhas), recusada se alguma caixinha já liberou o que ela reservou.
 */
export async function estornarNoBanco(id: string, autorId: string): Promise<ResultadoEstorno> {
  return prisma.$transaction(async (tx) => {
    const { lancamento: l, estado } = await exigirOperacao(tx, id, "estornar");
    // N5: estornar tira o pagamento do mês em que ele caiu.
    await exigirPeriodoAberto(tx, [l.dataConfirmacao]);

    const parcial = l.valorEfetivo != null && paraCentavos(l.valorEfetivo) < paraCentavos(l.valor);
    let restantesExcluidos = 0;
    let aviso: string | null = null;
    if (parcial) {
      const restantes = await tx.lancamento.findMany({
        where: {
          excluidoEm: null,
          OR: [{ restanteDeId: id }, { recorrenciaGrupo: id, observacao: { contains: MARCA_RESTANTE } }],
        },
        select: { id: true, status: true },
      });
      if (restantes.some((r) => r.status === "confirmado")) {
        throw new ActionError("O saldo restante desta baixa parcial já foi pago: estorne ele antes.");
      }
      const abertos = restantes.filter((r) => r.status !== "cancelado").map((r) => r.id);
      if (abertos.length > 0) {
        const r = await tx.lancamento.updateMany({
          where: { id: { in: abertos }, status: { in: ["previsto", "aguardando_aprovacao"] }, excluidoEm: null },
          data: { excluidoEm: new Date() },
        });
        restantesExcluidos = r.count;
      } else if (restantes.length === 0) {
        aviso = "Baixa parcial antiga, sem o saldo restante ligado: confira se sobrou uma conta em aberto do restante e cancele-a.";
      }
    }

    const distribuicaoDesfeita = estado.distribuido ? await desfazerDistribuicao(tx, id) : false;

    const r = await tx.lancamento.updateMany({
      where: { id, status: "confirmado", excluidoEm: null },
      data: { status: situacaoDepois("estornar", estado), dataConfirmacao: null, valorEfetivo: null },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: id, de: estado.status, para: "previsto", autorId } });
    return { restantesExcluidos, distribuicaoDesfeita, aviso };
  });
}

/**
 * Tira a distribuição de uma receita: apaga os movimentos de alocação que ela criou e o registro da
 * distribuição (a receita volta à fila quando for recebida de novo). Com o lock das caixinhas, recusa
 * se o alocado de alguma ficaria negativo — o dinheiro reservado já foi liberado ou transferido.
 */
async function desfazerDistribuicao(tx: Prisma.TransactionClient, lancamentoId: string): Promise<boolean> {
  const d = await tx.distribuicaoRecebimento.findUnique({
    where: { lancamentoId },
    select: { id: true, movimentos: { select: { id: true, caixinhaId: true, valor: true } } },
  });
  if (!d) return false;
  const ids = [...new Set(d.movimentos.map((m) => m.caixinhaId))].sort();
  if (ids.length > 0) {
    await tx.$queryRaw`SELECT id FROM caixinha WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
    for (const caixinhaId of ids) {
      const soma = await tx.movimentoCaixinha.aggregate({ where: { caixinhaId }, _sum: { valor: true } });
      const daqui = d.movimentos.filter((m) => m.caixinhaId === caixinhaId).reduce((s, m) => s + paraCentavos(m.valor), 0);
      if (paraCentavos(soma._sum.valor ?? 0) - daqui < 0) {
        throw new ActionError(
          "As caixinhas já liberaram ou transferiram parte do que esta receita reservou: reserve de volta antes de estornar.",
        );
      }
    }
  }
  await tx.movimentoCaixinha.deleteMany({ where: { distribuicaoId: d.id } });
  await tx.distribuicaoRecebimento.delete({ where: { id: d.id } });
  return true;
}

/** Reabre um cancelado: volta a em aberto (ou à fila de aprovação, se tinha sido rejeitado). */
export async function reabrirNoBanco(id: string, autorId: string): Promise<{ status: string }> {
  return prisma.$transaction(async (tx) => {
    const { lancamento: l, estado } = await exigirOperacao(tx, id, "reabrir");
    await exigirPeriodoAberto(tx, datasDoLancamento(l));
    const para = situacaoDepois("reabrir", estado);
    const r = await tx.lancamento.updateMany({
      where: { id, status: "cancelado", excluidoEm: null },
      // Volta à aprovação limpa: quem aprovar de novo grava de novo.
      data: para === "aguardando_aprovacao" ? { status: para, motivoRejeicao: null, aprovadoPorId: null, aprovadoEm: null } : { status: para },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: id, de: "cancelado", para, autorId } });
    return { status: para };
  });
}

