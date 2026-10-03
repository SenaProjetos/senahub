import "server-only";

/**
 * Baixa de UM lançamento (M7): principal, juros/multa e desconto, numa transação só. As regras são do puro
 * `baixa.ts`; aqui ficam a gravação do principal, o resto do parcial e os acessórios. Separado da action para o smoke
 * alcançar sem sessão.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { pagamentoPagoNoFinanceiro } from "@/modules/financeiro/custo/lancamento-custo";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { camposDoPlanejador } from "@/modules/financeiro/lancamentos/parcial";
import { exigirOperacao, MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";
import { planejarBaixa, type PlanoDaBaixa } from "@/modules/financeiro/lancamentos/baixa";
import { exigirComprovanteSeObrigatorio } from "@/modules/financeiro/lancamentos/comprovante-service";
import { copiarRateioNoTx } from "@/modules/financeiro/lancamentos/rateio-service";

type Tx = Prisma.TransactionClient;

export type PedidoDeBaixa = {
  id: string;
  contaId?: string | null;
  formaId?: string | null;
  data: Date;
  /** Reais. Quanto do título é quitado; ausente = inteiro. */
  principal?: number | null;
  juros?: number | null;
  multa?: number | null;
  desconto?: number | null;
};

export type BaixaFeita = { restante: number | null; acessorios: number; caixa: number };

const centavos = (v: number | null | undefined) => (v == null ? 0 : Math.round(v * 100));

async function categoriaPorChave(tx: Tx, chave: string): Promise<string> {
  const c = await tx.categoriaFinanceira.findFirst({ where: { chave }, select: { id: true } });
  if (!c) throw new ActionError("A categoria de juros e descontos não existe no plano de contas: rode as migrações do banco.");
  return c.id;
}

export async function baixarNoTx(tx: Tx, i: PedidoDeBaixa, autorId: string): Promise<BaixaFeita> {
  await exigirOperacao(tx, i.id, "baixar");
  // N5: o pagamento não cai em mês fechado (a conta vencida de mês fechado se paga em mês aberto).
  await exigirPeriodoAberto(tx, [i.data]);
  // M10: comprovante obrigatório, se a config exigir (baixa manual — produtores são isentos por origem).
  await exigirComprovanteSeObrigatorio(tx, [i.id]);
  const lanc = await tx.lancamento.findUniqueOrThrow({ where: { id: i.id } });

  const plano = planejarBaixa({
    tipo: lanc.tipo,
    valor: paraCentavos(lanc.valor),
    principal: i.principal == null ? null : centavos(i.principal),
    juros: centavos(i.juros),
    multa: centavos(i.multa),
    desconto: centavos(i.desconto),
  });
  if ("erro" in plano) throw new ActionError(plano.erro);

  const contaId = i.contaId || lanc.contaId;
  const formaId = i.formaId || lanc.formaId;
  if (plano.acessorios.length > 0 && !contaId) {
    throw new ActionError("Juros, multa e desconto precisam da conta do pagamento: escolha a conta.");
  }

  // Condicionado à situação lida: duas baixas ao mesmo tempo não pagam duas vezes.
  const r = await tx.lancamento.updateMany({
    where: { id: i.id, status: "previsto", excluidoEm: null },
    data: {
      status: "confirmado",
      dataConfirmacao: i.data,
      contaId,
      formaId,
      valorEfetivo: plano.valorEfetivo == null ? null : plano.valorEfetivo / 100,
    },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
  await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: i.id, de: lanc.status, para: "confirmado", autorId } });

  await gravarRestante(tx, lanc, plano, autorId);

  for (const a of plano.acessorios) {
    const acessorio = await tx.lancamento.create({
      data: {
        tipo: a.tipo,
        descricao: `${a.rotulo} — ${lanc.descricao}`,
        valor: a.valor / 100,
        status: "confirmado",
        data: i.data,
        dataCompetencia: i.data,
        dataConfirmacao: i.data,
        contaId,
        formaId,
        categoriaId: await categoriaPorChave(tx, a.chaveCategoria),
        // O acessório é do mesmo projeto/centro/contato: a margem do projeto enxerga o juro que ele custou.
        centroId: lanc.centroId,
        projetoId: lanc.projetoId,
        fornecedorId: lanc.fornecedorId,
        clienteId: lanc.clienteId,
        acessorioDeId: lanc.id,
        autorId,
        statusHistorico: { create: { de: null, para: "confirmado", autorId } },
      },
      select: { id: true },
    });
    await copiarRateioNoTx(tx, lanc.id, acessorio.id);
  }

  if (lanc.pagamentoProjetistaId) {
    await tx.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(lanc.pagamentoProjetistaId, i.data));
  }
  return { restante: plano.restante == null ? null : plano.restante / 100, acessorios: plano.acessorios.length, caixa: plano.caixa / 100 };
}

type Lanc = Awaited<ReturnType<Tx["lancamento"]["findUniqueOrThrow"]>>;

/** Pagamento parcial: o que falta vira um novo lançamento em aberto, ligado ao pago (o estorno o leva junto, N1). */
async function gravarRestante(tx: Tx, lanc: Lanc, plano: PlanoDaBaixa, autorId: string) {
  if (plano.restante == null) return;
  const resto = await tx.lancamento.create({
    data: {
      tipo: lanc.tipo,
      descricao: lanc.descricao,
      valor: plano.restante / 100,
      status: "previsto" as const,
      data: lanc.data,
      vencimento: lanc.vencimento,
      categoriaId: lanc.categoriaId,
      centroId: lanc.centroId,
      contaId: lanc.contaId,
      formaId: lanc.formaId,
      projetoId: lanc.projetoId,
      fornecedorId: lanc.fornecedorId,
      clienteId: lanc.clienteId,
      tags: lanc.tags,
      documentoFinanceiroId: lanc.documentoFinanceiroId,
      numeroDocumento: lanc.numeroDocumento,
      chaveNfe: lanc.chaveNfe,
      ...camposDoPlanejador(lanc),
      observacao: [lanc.observacao, "Saldo restante de pagamento parcial"].filter(Boolean).join(" · "),
      recorrenciaGrupo: lanc.recorrenciaGrupo ?? lanc.id,
      restanteDeId: lanc.id,
      autorId,
      statusHistorico: { create: { de: null, para: "previsto", autorId } },
    },
    select: { id: true },
  });
  await copiarRateioNoTx(tx, lanc.id, resto.id);
}

export async function baixarNoBanco(i: PedidoDeBaixa, autorId: string): Promise<BaixaFeita> {
  return prisma.$transaction((tx) => baixarNoTx(tx, i, autorId));
}
