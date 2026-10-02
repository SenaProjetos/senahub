import "server-only";

/**
 * I/O dos cartões de crédito (M3). As regras de ciclo e parcela são do puro `ciclo.ts`; aqui ficam a
 * fatura no banco, a compra (uma ou parcelada) e o pagamento. Separado das actions para o smoke
 * alcançar sem sessão.
 *
 * Invariante da fase: a compra é despesa do dia da compra e o caixa só sai no pagamento — pagar NÃO
 * cria lançamento nenhum, só realiza as compras do ciclo.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { motivoCategoriaIncompativel } from "@/modules/financeiro/categorias-regras";
import { exigirOperacao, MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";
import {
  cicloDaCompra,
  descricaoDaParcela,
  motivoParaNaoPagar,
  parcelasDaCompra,
  type CicloDoCartao,
  type Dia,
} from "@/modules/financeiro/cartoes/ciclo";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

const dataDoDia = (d: Dia) => new Date(`${d}T00:00:00.000Z`);
const diaDe = (d: Date | null) => (d ? (d.toISOString().slice(0, 10) as Dia) : null);

/** A fatura do ciclo, criada na hora se ainda não existir (idempotente pelo par cartão+competência). */
export async function garantirFatura(db: Db, cartaoId: string, ciclo: CicloDoCartao) {
  return db.faturaCartao.upsert({
    where: { cartaoId_competencia: { cartaoId, competencia: ciclo.competencia } },
    // A corrida cria uma só: a chave única decide, e quem perde lê a que ficou.
    update: {},
    create: {
      cartaoId,
      competencia: ciclo.competencia,
      inicioCiclo: dataDoDia(ciclo.inicioCiclo),
      fimCiclo: dataDoDia(ciclo.fimCiclo),
      vencimento: dataDoDia(ciclo.vencimento),
    },
    select: { id: true, competencia: true, vencimento: true },
  });
}

export type CompraNoCartao = {
  cartaoId: string;
  descricao: string;
  /** Reais, positivo (o total da compra, não o da parcela). */
  valor: number;
  dataCompra: Dia;
  categoriaId: string;
  parcelas: number;
  centroId?: string | null;
  projetoId?: string | null;
  fornecedorId?: string | null;
  observacao?: string | null;
};

export type CompraCriada = { lancamentoIds: string[]; faturas: string[] };

/**
 * Lança uma compra no cartão: uma despesa por parcela, cada uma na fatura do SEU ciclo, em aberto e
 * sem conta (a conta só aparece no pagamento). Isenta da alçada por origem (spec §7): a despesa já
 * aconteceu, e travar a fatura em aprovação geraria juros.
 */
export async function lancarCompraNoBanco(i: CompraNoCartao, autorId: string): Promise<CompraCriada> {
  return prisma.$transaction(async (tx) => {
    const cartao = await tx.cartaoCredito.findUnique({
      where: { id: i.cartaoId },
      select: { id: true, ativo: true, diaFechamento: true, diaVencimento: true },
    });
    if (!cartao) throw new ActionError("Cartão não encontrado.");
    if (!cartao.ativo) throw new ActionError("Este cartão está inativo.");

    const cat = await tx.categoriaFinanceira.findUnique({ where: { id: i.categoriaId }, select: { tipo: true } });
    if (!cat) throw new ActionError("Categoria não encontrada.");
    const incompativel = motivoCategoriaIncompativel("despesa", cat.tipo);
    if (incompativel) throw new ActionError(incompativel);

    const parcelas = parcelasDaCompra(Math.round(i.valor * 100), i.parcelas, i.dataCompra);
    // N5: nenhuma parcela nasce em mês fechado (a despesa é do mês da parcela).
    await exigirPeriodoAberto(tx, parcelas.map((p) => dataDoDia(p.data)));

    const ids: string[] = [];
    const faturas: string[] = [];
    for (const p of parcelas) {
      const ciclo = cicloDaCompra(cartao, p.data);
      const fatura = await garantirFatura(tx, cartao.id, ciclo);
      const l = await tx.lancamento.create({
        data: {
          tipo: "despesa",
          descricao: descricaoDaParcela(i.descricao, p),
          valor: p.valorCentavos / 100,
          status: "previsto",
          data: dataDoDia(p.data),
          dataCompetencia: dataDoDia(p.data),
          vencimento: fatura.vencimento,
          categoriaId: i.categoriaId,
          centroId: i.centroId || null,
          projetoId: i.projetoId || null,
          fornecedorId: i.fornecedorId || null,
          observacao: i.observacao || null,
          cartaoId: cartao.id,
          faturaId: fatura.id,
          autorId,
          statusHistorico: { create: { de: null, para: "previsto", autorId } },
        },
        select: { id: true },
      });
      ids.push(l.id);
      if (!faturas.includes(fatura.id)) faturas.push(fatura.id);
    }
    return { lancamentoIds: ids, faturas };
  });
}

/** Baixa uma compra: vira realizada na conta e na data do pagamento. Usada pela fatura e pelo avulso. */
async function baixarCompra(tx: Tx, lancamentoId: string, contaId: string, dia: Dia, autorId: string) {
  const { estado } = await exigirOperacao(tx, lancamentoId, "baixar");
  const r = await tx.lancamento.updateMany({
    where: { id: lancamentoId, status: "previsto", excluidoEm: null },
    data: { status: "confirmado", dataConfirmacao: dataDoDia(dia), contaId },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
  await tx.lancamentoStatusHistorico.create({ data: { lancamentoId, de: estado.status, para: "confirmado", autorId } });
}

export type PagamentoDeFatura = { faturaId: string; contaId: string; data: Dia };
export type FaturaPaga = { comprasPagas: number; totalCentavos: number };

/**
 * Paga a fatura: realiza TODAS as compras em aberto dela, numa transação. Não cria lançamento de
 * pagamento — cada compra já é a despesa, e um segundo lançamento contaria o gasto duas vezes.
 */
export async function pagarFaturaNoBanco(i: PagamentoDeFatura, autorId: string): Promise<FaturaPaga> {
  return prisma.$transaction(async (tx) => {
    const f = await tx.faturaCartao.findUnique({
      where: { id: i.faturaId },
      select: { id: true, fimCiclo: true, cartao: { select: { nome: true } } },
    });
    if (!f) throw new ActionError("Fatura não encontrada.");
    const conta = await tx.contaBancaria.findUnique({ where: { id: i.contaId }, select: { ativo: true } });
    if (!conta?.ativo) throw new ActionError("A conta escolhida não existe ou está inativa.");

    const compras = await tx.lancamento.findMany({
      where: { faturaId: f.id, excluidoEm: null },
      select: { id: true, status: true, valor: true },
    });
    const abertas = compras.filter((c) => c.status === "previsto");
    const motivo = motivoParaNaoPagar(
      { fimCiclo: diaDe(f.fimCiclo)! },
      { emAberto: abertas.length, pagas: compras.filter((c) => c.status === "confirmado").length },
      diaDeSaoPaulo(),
    );
    if (motivo) throw new ActionError(motivo);

    // N5: o pagamento cai no mês da data escolhida.
    await exigirPeriodoAberto(tx, [dataDoDia(i.data)]);
    for (const c of abertas) await baixarCompra(tx, c.id, i.contaId, i.data, autorId);
    return {
      comprasPagas: abertas.length,
      totalCentavos: abertas.reduce((s, c) => s + Math.round(Number(c.valor) * 100), 0),
    };
  });
}

/**
 * Paga UMA compra do cartão (o "Reembolsar só esta" do cartão pessoal). A fatura continua com o resto
 * e passa a se ler como paga quando a última for baixada.
 */
export async function pagarCompraNoBanco(lancamentoId: string, contaId: string, dia: Dia, autorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const l = await tx.lancamento.findUnique({ where: { id: lancamentoId }, select: { cartaoId: true } });
    if (!l?.cartaoId) throw new ActionError("Esta despesa não é de cartão.");
    const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
    if (!conta?.ativo) throw new ActionError("A conta escolhida não existe ou está inativa.");
    await exigirPeriodoAberto(tx, [dataDoDia(dia)]);
    await baixarCompra(tx, lancamentoId, contaId, dia, autorId);
  });
}

export type EdicaoDeCompra = {
  lancamentoId: string;
  descricao: string;
  valor: number;
  dataCompra: Dia;
  categoriaId: string;
  centroId?: string | null;
  projetoId?: string | null;
  fornecedorId?: string | null;
  observacao?: string | null;
};

/**
 * Edita uma compra em aberto. Mudar a data da compra pode mudar de fatura — e é por isso que a edição
 * mora aqui e não no formulário comum: a fatura e o vencimento andam junto com a data.
 */
export async function editarCompraNoBanco(i: EdicaoDeCompra, autorId: string): Promise<{ faturaId: string }> {
  return prisma.$transaction(async (tx) => {
    const { lancamento: l } = await exigirOperacao(tx, i.lancamentoId, "editar");
    const atual = await tx.lancamento.findUnique({
      where: { id: i.lancamentoId },
      select: { cartaoId: true, faturaId: true, data: true, cartao: { select: { id: true, diaFechamento: true, diaVencimento: true, ativo: true } } },
    });
    if (!atual?.cartao) throw new ActionError("Esta despesa não é de cartão.");
    if (l.status !== "previsto") throw new ActionError("Esta compra já foi paga: estorne antes de mexer nela.");

    const cat = await tx.categoriaFinanceira.findUnique({ where: { id: i.categoriaId }, select: { tipo: true } });
    if (!cat) throw new ActionError("Categoria não encontrada.");
    const incompativel = motivoCategoriaIncompativel("despesa", cat.tipo);
    if (incompativel) throw new ActionError(incompativel);

    // N5: a data de antes e a de agora precisam estar em mês aberto.
    await exigirPeriodoAberto(tx, [atual.data, dataDoDia(i.dataCompra)]);

    const fatura = await garantirFatura(tx, atual.cartao.id, cicloDaCompra(atual.cartao, i.dataCompra));
    const r = await tx.lancamento.updateMany({
      where: { id: i.lancamentoId, status: "previsto", excluidoEm: null },
      data: {
        descricao: i.descricao,
        valor: i.valor,
        data: dataDoDia(i.dataCompra),
        dataCompetencia: dataDoDia(i.dataCompra),
        vencimento: fatura.vencimento,
        categoriaId: i.categoriaId,
        centroId: i.centroId || null,
        projetoId: i.projetoId || null,
        fornecedorId: i.fornecedorId || null,
        observacao: i.observacao || null,
        faturaId: fatura.id,
      },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    void autorId;
    return { faturaId: fatura.id };
  });
}
