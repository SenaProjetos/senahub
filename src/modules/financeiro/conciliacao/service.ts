import "server-only";

/**
 * I/O da conciliação bancária (N4). As regras são de `casamento.ts` (puro); aqui ficam a transação,
 * a foto do lançamento antes de conciliar e a conferência do saldo. Separado das actions e da rota do
 * OFX para o smoke alcançar sem sessão.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { pagamentoPagoNoFinanceiro } from "@/modules/financeiro/custo/lancamento-custo";
import { exigirOperacao } from "@/modules/financeiro/lancamentos/situacao-service";
import { exigirPeriodoAberto, mesesFechados } from "@/modules/financeiro/fechamento/trava-service";
import { mesDe } from "@/modules/financeiro/fechamento/trava";
import { paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import {
  casamentoAutomatico,
  planoDesconciliar,
  type CandidatoConciliacao,
  type EstadoAntesDaConciliacao,
} from "@/modules/financeiro/conciliacao/casamento";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

const dia = (d: Date | null | undefined) => (d ? isoDeDataDoBanco(d) : null);

/** Candidatos a casar: em aberto e pagos ainda sem transação (G1c), não excluídos. */
export async function candidatosDeConciliacao(db: Db): Promise<(CandidatoConciliacao & { descricao: string; valor: number })[]> {
  const ls = await db.lancamento.findMany({
    where: { status: { in: ["previsto", "confirmado", "aguardando_aprovacao"] }, transacao: null, excluidoEm: null },
    select: {
      id: true,
      tipo: true,
      valor: true,
      descricao: true,
      status: true,
      contaId: true,
      transferenciaId: true,
      data: true,
      vencimento: true,
      dataConfirmacao: true,
    },
  });
  return ls.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    valorCentavos: paraCentavos(l.valor),
    valor: Number(l.valor),
    descricao: l.descricao,
    status: l.status,
    contaId: l.contaId,
    transferenciaId: l.transferenciaId,
    dia: dia(l.status === "confirmado" ? (l.dataConfirmacao ?? l.data) : (l.vencimento ?? l.data))!,
  }));
}

async function fotoAntes(tx: Tx, lancamentoId: string): Promise<EstadoAntesDaConciliacao> {
  const l = await tx.lancamento.findUniqueOrThrow({
    where: { id: lancamentoId },
    select: { status: true, dataConfirmacao: true, contaId: true, pagamentoProjetistaId: true },
  });
  const p = l.pagamentoProjetistaId
    ? await tx.pagamentoProjetista.findUnique({ where: { id: l.pagamentoProjetistaId }, select: { status: true, pagoEm: true } })
    : null;
  return {
    criadoPelaConciliacao: false,
    status: l.status,
    dataConfirmacao: dia(l.dataConfirmacao),
    contaId: l.contaId,
    pagamento: p ? { status: p.status, pagoEm: p.pagoEm ? p.pagoEm.toISOString() : null } : null,
  };
}

/**
 * Liga a transação ao lançamento e o confirma na data e na conta do extrato. Passa pela máquina de
 * situações (cancelado, em aprovação, previsão e excluído recusam) e grava a foto de antes.
 */
async function ligar(tx: Tx, t: { id: string; data: Date; contaId: string }, lancamentoId: string, autorId: string) {
  const { lancamento: l, estado } = await exigirOperacao(tx, lancamentoId, "conciliar");
  // N5: o pagamento entra no mês da transação.
  await exigirPeriodoAberto(tx, [t.data]);
  if (l.status === "confirmado") {
    // Pago antes (G1c): o extrato só confirma. Outra conta seria trocar de onde o dinheiro saiu.
    const conta = await tx.lancamento.findUniqueOrThrow({ where: { id: lancamentoId }, select: { contaId: true } });
    if (conta.contaId && conta.contaId !== t.contaId) {
      throw new ActionError("Este lançamento foi pago por outra conta: concilie com o extrato dela.");
    }
  }
  const antes = await fotoAntes(tx, lancamentoId);
  const r = await tx.transacaoBancaria.updateMany({
    where: { id: t.id, conciliado: false },
    data: { conciliado: true, lancamentoId, estadoAnterior: antes },
  });
  if (r.count !== 1) throw new ActionError("Transação já conciliada.");
  await tx.lancamento.update({ where: { id: lancamentoId }, data: { status: "confirmado", dataConfirmacao: t.data, contaId: t.contaId } });
  if (estado.status !== "confirmado") {
    await tx.lancamentoStatusHistorico.create({ data: { lancamentoId, de: estado.status, para: "confirmado", autorId } });
  }
  const pag = await tx.lancamento.findUniqueOrThrow({ where: { id: lancamentoId }, select: { pagamentoProjetistaId: true } });
  if (pag.pagamentoProjetistaId) {
    await tx.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(pag.pagamentoProjetistaId, t.data));
  }
}

export async function conciliarNoBanco(transacaoId: string, lancamentoId: string, autorId: string) {
  await prisma.$transaction(async (tx) => {
    const t = await tx.transacaoBancaria.findUnique({ where: { id: transacaoId }, select: { id: true, data: true, contaId: true, conciliado: true } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");
    await ligar(tx, t, lancamentoId, autorId);
  });
}

/** Cria o lançamento pago a partir da transação e concilia (a foto marca "criado pela conciliação"). */
export async function criarDaTransacaoNoBanco(transacaoId: string, categoriaId: string, autorId: string) {
  await prisma.$transaction(async (tx) => {
    const t = await tx.transacaoBancaria.findUnique({ where: { id: transacaoId } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (t.conciliado) throw new ActionError("Transação já conciliada.");
    await exigirPeriodoAberto(tx, [t.data]);
    const lanc = await tx.lancamento.create({
      data: {
        tipo: Number(t.valor) > 0 ? "receita" : "despesa",
        descricao: t.descricao,
        valor: Math.abs(Number(t.valor)),
        status: "confirmado",
        data: t.data,
        dataConfirmacao: t.data,
        categoriaId,
        contaId: t.contaId,
        autorId,
        statusHistorico: { create: { de: null, para: "confirmado", autorId } },
      },
    });
    const antes: EstadoAntesDaConciliacao = { criadoPelaConciliacao: true, status: "confirmado", dataConfirmacao: null, contaId: null, pagamento: null };
    const r = await tx.transacaoBancaria.updateMany({
      where: { id: t.id, conciliado: false },
      data: { conciliado: true, lancamentoId: lanc.id, estadoAnterior: antes },
    });
    if (r.count !== 1) throw new ActionError("Transação já conciliada.");
  });
}

/**
 * Desfaz a conciliação: a transação volta para a fila e o lançamento volta ao que era antes dela
 * (`planoDesconciliar`). Conciliação antiga, lançamento mexido depois ou receita distribuída: só
 * desliga, como sempre foi.
 */
export async function desconciliarNoBanco(transacaoId: string, autorId: string): Promise<{ lancamentoId: string | null; aviso: string | null; efeito: string }> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transacaoBancaria.findUnique({ where: { id: transacaoId }, select: { id: true, conciliado: true, lancamentoId: true, data: true, estadoAnterior: true } });
    if (!t) throw new ActionError("Transação não encontrada.");
    if (!t.conciliado && !t.lancamentoId) throw new ActionError("Esta transação não está conciliada.");
    await tx.transacaoBancaria.update({ where: { id: t.id }, data: { conciliado: false, lancamentoId: null, estadoAnterior: Prisma.DbNull } });
    if (!t.lancamentoId) return { lancamentoId: null, aviso: null, efeito: "ignorada" };

    const l = await tx.lancamento.findUniqueOrThrow({
      where: { id: t.lancamentoId },
      select: { id: true, status: true, dataConfirmacao: true, pagamentoProjetistaId: true, distribuicao: { select: { id: true } } },
    });
    const plano = planoDesconciliar({
      antes: (t.estadoAnterior as EstadoAntesDaConciliacao | null) ?? null,
      atual: { status: l.status, dataConfirmacao: dia(l.dataConfirmacao), distribuido: l.distribuicao != null },
      diaDaTransacao: dia(t.data)!,
    });
    if (plano.tipo === "so_desligar") return { lancamentoId: l.id, aviso: plano.aviso, efeito: "desligada" };
    // Devolver/excluir mexe no caixa do mês da transação (N5).
    await exigirPeriodoAberto(tx, [t.data]);
    if (plano.tipo === "excluir") {
      await tx.lancamento.update({ where: { id: l.id }, data: { excluidoEm: new Date() } });
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: l.status, para: "excluido", autorId } });
      return { lancamentoId: l.id, aviso: null, efeito: "excluido" };
    }
    const e = plano.estado;
    await tx.lancamento.update({
      where: { id: l.id },
      data: {
        status: e.status as "previsto" | "aguardando_aprovacao",
        dataConfirmacao: e.dataConfirmacao ? new Date(`${e.dataConfirmacao}T00:00:00.000Z`) : null,
        contaId: e.contaId,
      },
    });
    await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: l.status, para: e.status, autorId } });
    if (l.pagamentoProjetistaId && e.pagamento) {
      await tx.pagamentoProjetista.updateMany({
        where: { id: l.pagamentoProjetistaId, status: "pago" },
        data: { status: e.pagamento.status as "pendente" | "pago", pagoEm: e.pagamento.pagoEm ? new Date(e.pagamento.pagoEm) : null },
      });
    }
    return { lancamentoId: l.id, aviso: null, efeito: "restaurado" };
  });
}

/**
 * Saldo da conta no fim de um dia, pelo sistema: saldo inicial + o que foi pago e recebido nela até
 * a data. Transferência conta (move o saldo da conta); `natureza-ok: saldo de conta inclui tudo`.
 */
export async function saldoDoSistema(db: Db, contaId: string, ateDia: string): Promise<number> {
  const conta = await db.contaBancaria.findUniqueOrThrow({ where: { id: contaId }, select: { saldoInicial: true } });
  const ls = await db.lancamento.findMany({
    where: { contaId, status: "confirmado", excluidoEm: null, dataConfirmacao: { lte: new Date(`${ateDia}T00:00:00.000Z`) } },
    select: { tipo: true, valor: true, valorEfetivo: true },
  });
  const c = ls.reduce((s, l) => s + (l.tipo === "receita" ? 1 : -1) * paraCentavos(l.valorEfetivo ?? l.valor), paraCentavos(conta.saldoInicial));
  return paraReais(c);
}

export type ResultadoOfx = {
  extratoId: string;
  importadas: number;
  duplicadas: number;
  conciliadas: number;
  /** Conferência com o saldo que o banco informou (nulo quando o OFX não traz saldo). */
  saldo: { dia: string; extrato: number; sistema: number; diferenca: number } | null;
};

/**
 * Importa as transações do OFX numa transação só (A4): ou entra o extrato inteiro, com as conciliações
 * automáticas, ou nada. Casamento automático só pela regra pura (mesma conta, centavos, sem empate,
 * sem transferência) e pela máquina de situações.
 */
export async function importarOfxNoBanco(p: {
  contaId: string;
  nomeArquivo: string;
  transacoes: { fitid: string; data: Date; valor: number; descricao: string }[];
  saldoExtrato: { saldo: number; data: Date } | null;
  autorId: string;
}): Promise<ResultadoOfx> {
  return prisma.$transaction(
    async (tx) => {
      const existentes = new Set(
        (await tx.transacaoBancaria.findMany({ where: { contaId: p.contaId, fitid: { in: p.transacoes.map((t) => t.fitid) } }, select: { fitid: true } })).map(
          (t) => t.fitid,
        ),
      );
      const novas = p.transacoes.filter((t) => !existentes.has(t.fitid));
      const extrato = await tx.extratoBancario.create({
        data: {
          contaId: p.contaId,
          nomeArquivo: p.nomeArquivo,
          // M0: o Extrato por conta confere o saldo do sistema com o que o banco informou.
          ...(p.saldoExtrato ? { saldoBanco: p.saldoExtrato.saldo, saldoBancoEm: p.saldoExtrato.data } : {}),
        },
      });
      let candidatos = novas.length > 0 ? await candidatosDeConciliacao(tx) : [];
      // N5: transação de mês fechado entra no extrato, mas não é conciliada sozinha.
      const fechados = await mesesFechados(tx);
      let conciliadas = 0;
      for (const n of novas) {
        const trans = await tx.transacaoBancaria.create({
          data: { extratoId: extrato.id, contaId: p.contaId, fitid: n.fitid, data: n.data, valor: n.valor, descricao: n.descricao },
        });
        const alvo = fechados.has(mesDe(n.data) ?? "") ? null : casamentoAutomatico({ valorCentavos: paraCentavos(n.valor), contaId: p.contaId, dia: dia(n.data)! }, candidatos);
        if (!alvo) continue;
        await ligar(tx, { id: trans.id, data: n.data, contaId: p.contaId }, alvo, p.autorId);
        candidatos = candidatos.filter((c) => c.id !== alvo);
        conciliadas++;
      }
      let saldo: ResultadoOfx["saldo"] = null;
      if (p.saldoExtrato) {
        const d = dia(p.saldoExtrato.data)!;
        const sistema = await saldoDoSistema(tx, p.contaId, d);
        saldo = { dia: d, extrato: p.saldoExtrato.saldo, sistema, diferenca: paraReais(paraCentavos(p.saldoExtrato.saldo) - paraCentavos(sistema)) };
      }
      return { extratoId: extrato.id, importadas: novas.length, duplicadas: p.transacoes.length - novas.length, conciliadas, saldo };
    },
    { maxWait: 15000, timeout: 120000 },
  );
}
