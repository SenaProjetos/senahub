import "server-only";

/**
 * I/O da carteira de investimentos (M4). Regras no puro `calculo.ts`; aqui ficam a conta do ativo, os lançamentos e
 * as transferências — cada operação numa transação só. Separado das actions para o smoke alcançar sem sessão.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { exigirOperacao, MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { criarTransferenciaNoTx, excluirTransferenciaNoBanco } from "@/modules/financeiro/transferencias/service";
import {
  MOTIVO_ARQUIVADO,
  motivoParaNaoArquivar,
  motivoParaNaoExcluir,
  planejarResgate,
  posicaoDoAtivo,
  sugerirRendimento,
  type LancamentoDoAtivo,
  type PosicaoDoAtivo,
} from "@/modules/financeiro/investimentos/calculo";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type Dia = string;

const dia = (d: Dia) => new Date(`${d}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const CHAVE_RENDIMENTO = "receita_rendimento_aplicacao";
export const CHAVE_IR = "despesa_ir_aplicacao";

async function categoria(db: Db, chave: string): Promise<string> {
  const c = await db.categoriaFinanceira.findFirst({ where: { chave }, select: { id: true } });
  if (!c) throw new ActionError("A categoria de investimentos não existe no plano de contas: rode as migrações do banco.");
  return c.id;
}

/** Ids das contas que SÃO ativos: ficam fora do caixa (spec §2). */
export async function idsContasDeInvestimento(db: Db = prisma): Promise<string[]> {
  return (await db.investimento.findMany({ select: { contaId: true } })).map((i) => i.contaId);
}

/** Lançamentos realizados da conta do ativo, no formato do puro. */
export async function lancamentosDoAtivo(db: Db, contaId: string): Promise<(LancamentoDoAtivo & { status: string })[]> {
  const ls = await db.lancamento.findMany({
    where: { contaId, status: "confirmado", excluidoEm: null },
    // natureza-ok: a conta do ativo soma tudo — perna de transferência é aporte/resgate.
    select: { id: true, tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true, data: true, transferenciaId: true, descricao: true, status: true },
  });
  return ls.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    valor: paraCentavos(l.valorEfetivo ?? l.valor),
    data: iso(l.dataConfirmacao ?? l.data),
    transferenciaId: l.transferenciaId,
    descricao: l.descricao,
    status: l.status,
  }));
}

async function lerAtivo(db: Db, id: string) {
  const a = await db.investimento.findUnique({
    where: { id },
    select: { id: true, nome: true, contaId: true, contaOrigemId: true, isentoIR: true, arquivado: true },
  });
  if (!a) throw new ActionError("Investimento não encontrado.");
  return a;
}

export async function posicaoNoBanco(db: Db, contaId: string): Promise<PosicaoDoAtivo> {
  return posicaoDoAtivo(await lancamentosDoAtivo(db, contaId));
}

export type DadosDoAtivo = {
  nome: string;
  tipo: "cdb" | "lci" | "lca" | "tesouro" | "fundo" | "poupanca" | "debenture" | "outro";
  instituicao?: string | null;
  indexador?: string | null;
  liquidez: "diaria" | "d1" | "vencimento" | "outra";
  vencimento?: Dia | null;
  isentoIR: boolean;
  contaOrigemId?: string | null;
  observacao?: string | null;
};

/** Cria o ativo e a conta dele (tipo investimento). Aporte inicial opcional, na mesma transação. */
export async function criarInvestimentoNoBanco(
  i: DadosDoAtivo & { aporte?: { valor: number; data: Dia; contaId: string } | null },
  autorId: string,
): Promise<{ id: string; contaId: string }> {
  return prisma.$transaction(async (tx) => {
    const conta = await tx.contaBancaria.create({
      data: { nome: i.nome, tipo: "investimento", banco: i.instituicao || null, saldoInicial: 0, ordem: 900 },
      select: { id: true },
    });
    const a = await tx.investimento.create({
      data: {
        nome: i.nome,
        tipo: i.tipo,
        instituicao: i.instituicao || null,
        indexador: i.indexador || null,
        liquidez: i.liquidez,
        vencimento: i.vencimento ? dia(i.vencimento) : null,
        isentoIR: i.isentoIR,
        contaId: conta.id,
        contaOrigemId: i.contaOrigemId || i.aporte?.contaId || null,
        observacao: i.observacao || null,
      },
      select: { id: true },
    });
    if (i.aporte && i.aporte.valor > 0) {
      await criarTransferenciaNoTx(
        tx,
        { origemId: i.aporte.contaId, destinoId: conta.id, valor: i.aporte.valor, data: i.aporte.data, descricao: `Aporte — ${i.nome}`, realizada: true },
        autorId,
      );
    }
    return { id: a.id, contaId: conta.id };
  });
}

/** Edita os dados do ativo (o nome acompanha na conta dele). Não mexe em movimento. */
export async function editarInvestimentoNoBanco(id: string, i: DadosDoAtivo): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const a = await lerAtivo(tx, id);
    await tx.investimento.update({
      where: { id },
      data: {
        nome: i.nome,
        tipo: i.tipo,
        instituicao: i.instituicao || null,
        indexador: i.indexador || null,
        liquidez: i.liquidez,
        vencimento: i.vencimento ? dia(i.vencimento) : null,
        isentoIR: i.isentoIR,
        contaOrigemId: i.contaOrigemId || null,
        observacao: i.observacao || null,
      },
    });
    await tx.contaBancaria.update({ where: { id: a.contaId }, data: { nome: i.nome, banco: i.instituicao || null } });
  });
}

/** Aporte: transferência da conta corrente para a conta do ativo. */
export async function aportarNoBanco(i: { investimentoId: string; contaId: string; valor: number; data: Dia }, autorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const a = await lerAtivo(tx, i.investimentoId);
    if (a.arquivado) throw new ActionError(MOTIVO_ARQUIVADO);
    await criarTransferenciaNoTx(tx, { origemId: i.contaId, destinoId: a.contaId, valor: i.valor, data: i.data, descricao: `Aporte — ${a.nome}`, realizada: true }, autorId);
  });
}

async function lancarNoAtivo(tx: Tx, a: { contaId: string; nome: string }, o: { tipo: "rendimento" | "imposto"; centavos: number; data: Dia; descricao?: string }, autorId: string) {
  const ehRendimento = o.tipo === "rendimento";
  await tx.lancamento.create({
    data: {
      tipo: ehRendimento ? "receita" : "despesa",
      descricao: o.descricao ?? `${ehRendimento ? "Rendimento" : "IR provisionado"} — ${a.nome}`,
      valor: o.centavos / 100,
      status: "confirmado",
      data: dia(o.data),
      dataCompetencia: dia(o.data),
      dataConfirmacao: dia(o.data),
      contaId: a.contaId,
      categoriaId: await categoria(tx, ehRendimento ? CHAVE_RENDIMENTO : CHAVE_IR),
      autorId,
      statusHistorico: { create: { de: null, para: "confirmado", autorId } },
    },
  });
}

/**
 * Registrar rendimento: o rendimento é a diferença do bruto informado para o do sistema; o IR vem sugerido e a
 * pessoa pode trocar (`ir` informado vence a sugestão).
 */
export async function registrarRendimentoNoBanco(
  i: { investimentoId: string; brutoInformado: number; data: Dia; ir?: number | null },
  autorId: string,
): Promise<{ rendimento: number; ir: number }> {
  return prisma.$transaction(async (tx) => {
    const a = await lerAtivo(tx, i.investimentoId);
    if (a.arquivado) throw new ActionError(MOTIVO_ARQUIVADO);
    const s = sugerirRendimento(await posicaoNoBanco(tx, a.contaId), { brutoInformado: Math.round(i.brutoInformado * 100), data: i.data, isentoIR: a.isentoIR });
    if ("erro" in s) throw new ActionError(s.erro);
    const ir = i.ir == null ? s.ir : Math.round(i.ir * 100);
    if (ir < 0) throw new ActionError("O IR não pode ser negativo.");
    if (s.rendimento === 0 && ir === 0) throw new ActionError("Nada mudou: o valor informado é o mesmo que o sistema já tem.");
    await exigirPeriodoAberto(tx, [dia(i.data)]);
    if (s.rendimento > 0) await lancarNoAtivo(tx, a, { tipo: "rendimento", centavos: s.rendimento, data: i.data }, autorId);
    if (ir > 0) await lancarNoAtivo(tx, a, { tipo: "imposto", centavos: ir, data: i.data }, autorId);
    return { rendimento: s.rendimento, ir };
  });
}

/** Resgate: total (zera e arquiva, a diferença vira rendimento ou imposto) ou parcial (só a transferência). */
export async function resgatarNoBanco(
  i: { investimentoId: string; contaId: string; valorRecebido: number; data: Dia; total: boolean },
  autorId: string,
): Promise<{ ajuste: { tipo: "rendimento" | "imposto"; valor: number } | null; arquivado: boolean }> {
  return prisma.$transaction(async (tx) => {
    const a = await lerAtivo(tx, i.investimentoId);
    if (a.arquivado) throw new ActionError(MOTIVO_ARQUIVADO);
    const plano = planejarResgate(await posicaoNoBanco(tx, a.contaId), { valorRecebido: Math.round(i.valorRecebido * 100), total: i.total });
    if ("erro" in plano) throw new ActionError(plano.erro);
    await exigirPeriodoAberto(tx, [dia(i.data)]);
    if (plano.ajuste) {
      await lancarNoAtivo(
        tx,
        a,
        {
          tipo: plano.ajuste.tipo,
          centavos: plano.ajuste.valor,
          data: i.data,
          descricao: `${plano.ajuste.tipo === "rendimento" ? "Rendimento" : "IR/IOF"} acertado no resgate — ${a.nome}`,
        },
        autorId,
      );
    }
    await criarTransferenciaNoTx(
      tx,
      { origemId: a.contaId, destinoId: i.contaId, valor: plano.transferencia / 100, data: i.data, descricao: `Resgate — ${a.nome}`, realizada: true },
      autorId,
    );
    if (plano.total) await tx.investimento.update({ where: { id: a.id }, data: { arquivado: true } });
    return { ajuste: plano.ajuste, arquivado: plano.total };
  });
}

/**
 * Exclui um movimento: aporte/resgate pela transferência inteira (as duas pernas); rendimento/imposto pelo
 * lançamento. Excluir o resgate total de um ativo arquivado o devolve à carteira.
 */
export async function excluirMovimentoNoBanco(i: { investimentoId: string; lancamentoId: string }, autorId: string): Promise<void> {
  const a = await lerAtivo(prisma, i.investimentoId);
  const l = await prisma.lancamento.findUnique({ where: { id: i.lancamentoId }, select: { contaId: true, transferenciaId: true } });
  if (!l || l.contaId !== a.contaId) throw new ActionError("Este movimento não é deste ativo.");
  if (l.transferenciaId) {
    await excluirTransferenciaNoBanco(l.transferenciaId, autorId);
  } else {
    await prisma.$transaction(async (tx) => {
      const { lancamento, estado } = await exigirOperacao(tx, i.lancamentoId, "excluir");
      await exigirPeriodoAberto(tx, [lancamento.dataCompetencia ?? lancamento.data, lancamento.dataConfirmacao]);
      const r = await tx.lancamento.updateMany({ where: { id: i.lancamentoId, excluidoEm: null }, data: { excluidoEm: new Date() } });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: i.lancamentoId, de: estado.status, para: "excluido", autorId } });
    });
  }
  if (a.arquivado) {
    const p = await posicaoNoBanco(prisma, a.contaId);
    if (p.valorAtual !== 0) await prisma.investimento.update({ where: { id: a.id }, data: { arquivado: false } });
  }
}

/** Arquivar só com valor atual zero; desarquivar sempre. */
export async function arquivarNoBanco(id: string, arquivar: boolean): Promise<void> {
  const a = await lerAtivo(prisma, id);
  if (arquivar) {
    const m = motivoParaNaoArquivar(await posicaoNoBanco(prisma, a.contaId));
    if (m) throw new ActionError(m);
  }
  await prisma.investimento.update({ where: { id }, data: { arquivado: arquivar } });
}

/** Excluir só sem nenhum movimento: leva a conta do ativo junto. */
export async function excluirInvestimentoNoBanco(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const a = await lerAtivo(tx, id);
    // Qualquer lançamento na conta (até excluído) é histórico: só some o ativo que nunca foi usado.
    const movimentos = await tx.lancamento.count({ where: { contaId: a.contaId, excluidoEm: { not: undefined } } });
    const m = motivoParaNaoExcluir(movimentos);
    if (m) throw new ActionError(m);
    await tx.investimento.delete({ where: { id } });
    await tx.contaBancaria.delete({ where: { id: a.contaId } });
  });
}
