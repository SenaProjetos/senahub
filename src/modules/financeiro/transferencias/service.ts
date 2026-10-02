import "server-only";

/**
 * I/O das transferências entre contas (M8). As regras são do puro `calculo.ts`; aqui ficam as duas
 * pernas no banco, sempre gravadas na MESMA transação: ou as duas mudam, ou nenhuma. Separado das
 * actions para o smoke alcançar sem sessão.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";
import {
  descricaoDaTransferencia,
  motivoParaNaoCriar,
  motivoParaNaoMexer,
  type OperacaoDeTransferencia,
  type PernaDaTransferencia,
} from "@/modules/financeiro/transferencias/calculo";

type Tx = Prisma.TransactionClient;
type Dia = string;

const dia = (d: Dia) => new Date(`${d}T00:00:00.000Z`);

/**
 * A categoria de natureza `transferencia` do tipo pedido. A importação do Meu Dinheiro e a migração do
 * planejador já criam "Transferência"; se o plano ainda não tem uma, cria na hora (próximo nível 1 livre).
 */
export async function categoriaDeTransferencia(db: Tx | typeof prisma, tipo: "receita" | "despesa"): Promise<string> {
  const achada = await db.categoriaFinanceira.findFirst({
    where: { natureza: "transferencia", tipo, ativo: true },
    orderBy: [{ paiId: { sort: "asc", nulls: "first" } }, { codigo: "asc" }],
    select: { id: true },
  });
  if (achada) return achada.id;
  const todas = await db.categoriaFinanceira.findMany({ where: { paiId: null }, select: { codigo: true } });
  const maior = todas.reduce((m, c) => (/^\d+$/.test(c.codigo) ? Math.max(m, Number(c.codigo)) : m), 0);
  const nova = await db.categoriaFinanceira.create({
    data: { codigo: String(maior + 1), nome: "Transferência", tipo, natureza: "transferencia" },
    select: { id: true },
  });
  return nova.id;
}

export type NovaTransferencia = {
  origemId: string;
  destinoId: string;
  /** Reais, positivo. */
  valor: number;
  data: Dia;
  descricao?: string | null;
  observacao?: string | null;
  /** `true`: o dinheiro já se moveu (as duas pernas nascem pagas); `false`: fica agendada. */
  realizada: boolean;
};

async function contasDaTransferencia(tx: Tx, origemId: string, destinoId: string) {
  const contas = await tx.contaBancaria.findMany({ where: { id: { in: [origemId, destinoId] } }, select: { id: true, nome: true, ativo: true } });
  const origem = contas.find((c) => c.id === origemId);
  const destino = contas.find((c) => c.id === destinoId);
  if (!origem || !destino) throw new ActionError("Conta não encontrada.");
  if (!origem.ativo || !destino.ativo) throw new ActionError("Uma das contas está inativa.");
  return { origem, destino };
}

/** Cria o par: despesa na origem + receita no destino, mesmo valor, mesmo `transferenciaId`. */
export async function criarTransferenciaNoBanco(i: NovaTransferencia, autorId: string): Promise<{ transferenciaId: string; pernas: [string, string] }> {
  return prisma.$transaction((tx) => criarTransferenciaNoTx(tx, i, autorId));
}

/** O mesmo, dentro de uma transação de quem chama (aporte e resgate de investimento, M4). */
export async function criarTransferenciaNoTx(tx: Tx, i: NovaTransferencia, autorId: string): Promise<{ transferenciaId: string; pernas: [string, string] }> {
  const centavos = Math.round(i.valor * 100);
  const m = motivoParaNaoCriar({ origemId: i.origemId, destinoId: i.destinoId, valorCentavos: centavos });
  if (m) throw new ActionError(m);
  {
    const { origem, destino } = await contasDaTransferencia(tx, i.origemId, i.destinoId);
    // N5: o movimento cai no mês da data escolhida.
    await exigirPeriodoAberto(tx, [dia(i.data)]);
    const transferenciaId = randomUUID();
    const descricao = i.descricao?.trim() || descricaoDaTransferencia(origem.nome, destino.nome);
    const status = i.realizada ? ("confirmado" as const) : ("previsto" as const);
    const comum = {
      descricao,
      valor: centavos / 100,
      status,
      data: dia(i.data),
      vencimento: dia(i.data),
      dataConfirmacao: i.realizada ? dia(i.data) : null,
      observacao: i.observacao?.trim() || null,
      transferenciaId,
      autorId,
    };
    const saida = await tx.lancamento.create({
      data: { ...comum, tipo: "despesa", contaId: origem.id, categoriaId: await categoriaDeTransferencia(tx, "despesa"), statusHistorico: { create: { de: null, para: status, autorId } } },
      select: { id: true },
    });
    const entrada = await tx.lancamento.create({
      data: { ...comum, tipo: "receita", contaId: destino.id, categoriaId: await categoriaDeTransferencia(tx, "receita"), statusHistorico: { create: { de: null, para: status, autorId } } },
      select: { id: true },
    });
    return { transferenciaId, pernas: [saida.id, entrada.id] };
  }
}

/** Lê as pernas vivas do par, com o que a regra pura e a trava de período precisam. */
async function lerPernas(tx: Tx, transferenciaId: string) {
  const ls = await tx.lancamento.findMany({
    where: { transferenciaId, excluidoEm: null },
    select: {
      id: true, tipo: true, status: true, contaId: true, valor: true, data: true, dataConfirmacao: true,
      dataCompetencia: true, descricao: true, observacao: true, transacao: { select: { id: true } },
    },
    orderBy: { tipo: "asc" },
  });
  const pernas = ls.map((l) => ({ id: l.id, tipo: l.tipo, status: l.status as string, conciliado: l.transacao != null }));
  return { ls, pernas };
}

function exigir(op: OperacaoDeTransferencia, pernas: readonly PernaDaTransferencia[]) {
  const m = motivoParaNaoMexer(op, pernas);
  if (m) throw new ActionError(m);
}

export type EdicaoDeTransferencia = Omit<NovaTransferencia, "realizada"> & { transferenciaId: string };

/** Troca contas, valor, data e descrição das DUAS pernas juntas. Conciliada com o extrato não muda. */
export async function editarTransferenciaNoBanco(i: EdicaoDeTransferencia): Promise<void> {
  const centavos = Math.round(i.valor * 100);
  const m = motivoParaNaoCriar({ origemId: i.origemId, destinoId: i.destinoId, valorCentavos: centavos });
  if (m) throw new ActionError(m);
  await prisma.$transaction(async (tx) => {
    const { ls, pernas } = await lerPernas(tx, i.transferenciaId);
    exigir("editar", pernas);
    const { origem, destino } = await contasDaTransferencia(tx, i.origemId, i.destinoId);
    const saida = ls.find((l) => l.tipo === "despesa")!;
    const entrada = ls.find((l) => l.tipo === "receita")!;
    const realizada = saida.status === "confirmado";
    // N5: a data de antes e a de agora precisam estar em mês aberto.
    await exigirPeriodoAberto(tx, [saida.data, saida.dataConfirmacao, entrada.data, entrada.dataConfirmacao, dia(i.data)]);

    const descricao = i.descricao?.trim() || descricaoDaTransferencia(origem.nome, destino.nome);
    const comum = {
      descricao,
      valor: centavos / 100,
      data: dia(i.data),
      vencimento: dia(i.data),
      dataConfirmacao: realizada ? dia(i.data) : null,
      valorEfetivo: null,
      observacao: i.observacao?.trim() || null,
    };
    // Cada perna só muda se continua na situação que lemos (outra aba pode ter mexido nela).
    const s = await tx.lancamento.updateMany({ where: { id: saida.id, status: saida.status as "previsto" | "confirmado", excluidoEm: null }, data: { ...comum, contaId: origem.id } });
    const e = await tx.lancamento.updateMany({ where: { id: entrada.id, status: entrada.status as "previsto" | "confirmado", excluidoEm: null }, data: { ...comum, contaId: destino.id } });
    if (s.count !== 1 || e.count !== 1) throw new ActionError(MOTIVO_MUDOU);
  });
}

/** Exclui as DUAS pernas (exclusão lógica). */
export async function excluirTransferenciaNoBanco(transferenciaId: string, autorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { ls, pernas } = await lerPernas(tx, transferenciaId);
    exigir("excluir", pernas);
    await exigirPeriodoAberto(tx, ls.flatMap((l) => [l.data, l.dataConfirmacao]));
    for (const l of ls) {
      const r = await tx.lancamento.updateMany({ where: { id: l.id, status: l.status as "previsto" | "confirmado", excluidoEm: null }, data: { excluidoEm: new Date() } });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: l.status, para: "excluido", autorId } });
    }
  });
}

/** Dá baixa nas DUAS pernas: o dinheiro saiu de uma conta e entrou na outra no dia informado. */
export async function baixarTransferenciaNoBanco(transferenciaId: string, diaDaBaixa: Dia, autorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { ls, pernas } = await lerPernas(tx, transferenciaId);
    exigir("baixar", pernas);
    await exigirPeriodoAberto(tx, [dia(diaDaBaixa)]);
    for (const l of ls) {
      const r = await tx.lancamento.updateMany({
        where: { id: l.id, status: "previsto", excluidoEm: null },
        data: { status: "confirmado", dataConfirmacao: dia(diaDaBaixa) },
      });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: "previsto", para: "confirmado", autorId } });
    }
  });
}

/** Estorna as DUAS pernas: voltam a em aberto, sem data de pagamento. */
export async function estornarTransferenciaNoBanco(transferenciaId: string, autorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { ls, pernas } = await lerPernas(tx, transferenciaId);
    exigir("estornar", pernas);
    // N5: estornar tira o movimento do mês em que ele caiu.
    await exigirPeriodoAberto(tx, ls.map((l) => l.dataConfirmacao));
    for (const l of ls) {
      const r = await tx.lancamento.updateMany({
        where: { id: l.id, status: "confirmado", excluidoEm: null },
        data: { status: "previsto", dataConfirmacao: null, valorEfetivo: null },
      });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: "confirmado", para: "previsto", autorId } });
    }
  });
}

export type TransferenciaLida = {
  transferenciaId: string;
  origemId: string | null;
  destinoId: string | null;
  valor: number;
  data: Dia;
  descricao: string;
  observacao: string | null;
  realizada: boolean;
};

/** O par como a tela de edição o mostra; `null` se a transferência não existe (ou perdeu uma perna). */
export async function lerTransferencia(transferenciaId: string): Promise<TransferenciaLida | null> {
  const { ls } = await lerPernas(prisma, transferenciaId);
  const saida = ls.find((l) => l.tipo === "despesa");
  const entrada = ls.find((l) => l.tipo === "receita");
  if (!saida || !entrada) return null;
  return {
    transferenciaId,
    origemId: saida.contaId,
    destinoId: entrada.contaId,
    valor: Number(saida.valor),
    data: (saida.dataConfirmacao ?? saida.data).toISOString().slice(0, 10),
    descricao: saida.descricao,
    observacao: saida.observacao,
    realizada: saida.status === "confirmado",
  };
}
