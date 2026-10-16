import "server-only";

/**
 * I/O das retenções na nota (C4). As regras são do puro `retencoes.ts`; aqui: gravar as retenções do título, aplicá-las
 * na baixa (acessórios fora da DRE + contas dos impostos a recolher) e desfazê-las no estorno/desconciliação.
 *
 * TODO caminho que paga um título com retenção passa por `aplicarRetencoesNaBaixaNoTx` (baixa manual, baixa em lote,
 * conciliação, título lançado já pago). Pagamentos em lote do planejamento recusam (`MOTIVO_RETENCAO_LOTE`); títulos de
 * produção (projetista) e ART não levam retenção nesta versão.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import {
  CHAVE_IMPOSTO_RETIDO_A_RECOLHER,
  MOTIVO_IMPOSTO_RECOLHIDO,
  MOTIVO_RETENCAO_SEM_CONTA,
  diasDaConfig,
  motivoRetencaoParcial,
  planejarRetencoesNaBaixa,
  type DiasDeVencimento,
  type ImpostoRetido,
  type Retencao,
} from "@/modules/financeiro/lancamentos/retencoes";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const CHAVE_CONFIG_RETENCOES = "financeiro.retencoes";

export async function diasDeVencimentoDasRetencoes(db: Db = prisma): Promise<DiasDeVencimento> {
  const c = await db.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_RETENCOES } });
  return diasDaConfig(c?.valor ?? null);
}

/** Retenções gravadas no título, em centavos e na ordem fixa. */
export async function retencoesDoTitulo(db: Db, lancamentoId: string): Promise<Retencao[]> {
  const rs = await db.retencaoLancamento.findMany({ where: { lancamentoId }, select: { imposto: true, valor: true } });
  return rs
    .map((r) => ({ imposto: r.imposto as ImpostoRetido, valorCentavos: paraCentavos(r.valor) }))
    .sort((a, b) => ["iss", "irrf", "inss", "pis", "cofins", "csll"].indexOf(a.imposto) - ["iss", "irrf", "inss", "pis", "cofins", "csll"].indexOf(b.imposto));
}

/** Substitui as retenções do título (lista vazia = sem retenção). Validar é do chamador (`motivoRetencoesInvalidas`). */
export async function salvarRetencoesNoTx(tx: Tx, lancamentoId: string, retencoes: readonly Retencao[]): Promise<void> {
  await tx.retencaoLancamento.deleteMany({ where: { lancamentoId } });
  for (const r of retencoes) {
    if (r.valorCentavos <= 0) continue;
    await tx.retencaoLancamento.create({ data: { lancamentoId, imposto: r.imposto, valor: r.valorCentavos / 100 } });
  }
}

async function categoriaPorChave(tx: Tx, chave: string): Promise<string> {
  const c = await tx.categoriaFinanceira.findFirst({ where: { chave }, select: { id: true } });
  if (!c) throw new ActionError("As categorias de retenção não existem no plano de contas: rode as migrações do banco.");
  return c.id;
}

export type TituloPago = {
  id: string;
  tipo: "receita" | "despesa";
  descricao: string;
  numeroDocumento: string | null;
  chaveNfe: string | null;
  fornecedorId: string | null;
  clienteId: string | null;
  centroId: string | null;
  projetoId: string | null;
};

/**
 * Aplica as retenções do título que ACABOU de ser pago (o principal já está `confirmado`, pelo valor cheio): grava um
 * acessório por imposto na conta e data do pagamento (o banco fica com o líquido) e, na conta a pagar, uma conta de
 * imposto a recolher por imposto. Sem retenção, não faz nada. Pagamento parcial com retenção é recusado.
 */
export async function aplicarRetencoesNaBaixaNoTx(
  tx: Tx,
  titulo: TituloPago,
  o: { data: Date; contaId: string | null; formaId: string | null; autorId: string; parcial: boolean },
): Promise<{ acessorios: number; aRecolher: number; retidoCentavos: number }> {
  const retencoes = await retencoesDoTitulo(tx, titulo.id);
  if (retencoes.length === 0) return { acessorios: 0, aRecolher: 0, retidoCentavos: 0 };
  if (o.parcial) throw new ActionError(motivoRetencaoParcial(titulo.tipo));
  if (!o.contaId) throw new ActionError(MOTIVO_RETENCAO_SEM_CONTA);

  const plano = planejarRetencoesNaBaixa({ tipo: titulo.tipo, retencoes, diaPagamento: isoDeDataDoBanco(o.data), dias: await diasDeVencimentoDasRetencoes(tx) });
  const contato = titulo.fornecedorId
    ? (await tx.fornecedor.findUnique({ where: { id: titulo.fornecedorId }, select: { nome: true } }))?.nome
    : titulo.clienteId
      ? (await tx.cliente.findUnique({ where: { id: titulo.clienteId }, select: { nome: true } }))?.nome
      : null;

  for (const a of plano.acessorios) {
    await tx.lancamento.create({
      data: {
        tipo: a.tipo,
        descricao: `${a.rotulo} — ${titulo.descricao}`,
        valor: a.valorCentavos / 100,
        status: "confirmado",
        data: o.data,
        dataCompetencia: o.data,
        dataConfirmacao: o.data,
        contaId: o.contaId,
        formaId: o.formaId,
        categoriaId: await categoriaPorChave(tx, a.chaveCategoria),
        fornecedorId: titulo.fornecedorId,
        clienteId: titulo.clienteId,
        centroId: titulo.centroId,
        projetoId: titulo.projetoId,
        numeroDocumento: titulo.numeroDocumento,
        chaveNfe: titulo.chaveNfe,
        acessorioDeId: titulo.id,
        retencaoImposto: a.imposto,
        autorId: o.autorId,
        statusHistorico: { create: { de: null, para: "confirmado", autorId: o.autorId } },
      },
    });
  }

  for (const x of plano.aRecolher) {
    const vencimento = new Date(`${x.vencimento}T00:00:00.000Z`);
    await tx.lancamento.create({
      data: {
        tipo: "despesa",
        descricao: `${x.rotulo} — ${contato ?? titulo.descricao}`,
        valor: x.valorCentavos / 100,
        status: "previsto",
        // Competência = mês do pagamento da nota (quando a retenção aconteceu); o caixa sai no vencimento.
        data: o.data,
        dataCompetencia: o.data,
        vencimento,
        categoriaId: await categoriaPorChave(tx, CHAVE_IMPOSTO_RETIDO_A_RECOLHER),
        numeroDocumento: titulo.numeroDocumento,
        observacao: `Retido na nota${titulo.numeroDocumento ? ` ${titulo.numeroDocumento}` : ""} de ${contato ?? titulo.descricao}.`,
        retencaoDeId: titulo.id,
        retencaoImposto: x.imposto,
        autorId: o.autorId,
        statusHistorico: { create: { de: null, para: "previsto", autorId: o.autorId } },
      },
    });
  }
  return { acessorios: plano.acessorios.length, aRecolher: plano.aRecolher.length, retidoCentavos: plano.retidoCentavos };
}

/** Recusa se alguma conta de imposto gerada pela retenção do título já foi paga (o estorno não pode deixá-la órfã). */
export async function exigirImpostosNaoRecolhidos(db: Db, principalId: string): Promise<void> {
  const pago = await db.lancamento.count({ where: { retencaoDeId: principalId, excluidoEm: null, status: "confirmado" } });
  if (pago > 0) throw new ActionError(MOTIVO_IMPOSTO_RECOLHIDO);
}

/**
 * Desfaz a retenção aplicada na baixa (estorno, desconciliação): tira as contas de imposto em aberto (exclusão lógica).
 * Os acessórios saem por `excluirAcessoriosNoTx`, que o estorno já chama. Recusa se algum imposto já foi recolhido.
 */
export async function desfazerContasDeImpostoNoTx(tx: Tx, principalId: string, autorId: string): Promise<number> {
  await exigirImpostosNaoRecolhidos(tx, principalId);
  const abertas = await tx.lancamento.findMany({ where: { retencaoDeId: principalId, excluidoEm: null }, select: { id: true, status: true } });
  for (const a of abertas) {
    // Condicionado à situação lida: se o imposto foi pago entre a leitura e aqui, não some do caixa.
    const r = await tx.lancamento.updateMany({ where: { id: a.id, status: a.status, excluidoEm: null }, data: { excluidoEm: new Date() } });
    if (r.count !== 1) throw new ActionError(MOTIVO_IMPOSTO_RECOLHIDO);
    await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: a.id, de: a.status, para: "excluido", autorId } });
  }
  return abertas.length;
}
