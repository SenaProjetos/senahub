import "server-only";
import { prisma } from "@/lib/prisma";
import { utcFimDoDia, utcInicioDoDia } from "@/lib/data";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { conferirSaldo, montarExtrato, type ConferenciaDeSaldo, type MovimentoDaConta } from "@/modules/financeiro/extrato/calculo";
import { saldoDoSistema } from "@/modules/financeiro/conciliacao/service";

export type MovimentoDoExtrato = MovimentoDaConta & {
  descricao: string;
  categoria: string;
  projeto: string | null;
  conciliado: boolean;
  deTransferencia: boolean;
  /** Par da transferência (M8): as ações de transferência agem nas duas pernas. */
  transferenciaId: string | null;
  deProducao: boolean;
  /** Para "Corrigir pagamento…". */
  formaId: string | null;
  contaId: string | null;
  anexos: number;
};

/** Contas ativas, para o seletor. */
export async function contasDoExtrato() {
  return prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: [{ padrao: "desc" }, { ordem: "asc" }], select: { id: true, nome: true } });
}

/**
 * Extrato de UMA conta num mês: o realizado pela data do pagamento, com saldo corrido. A conferência com o
 * banco usa o último saldo informado em OFX cujo dia cai dentro do mês (ou no último dia anterior a ele).
 */
export async function extratoDaConta(contaId: string, mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const de = isoDeDataDoBanco(utcInicioDoDia(ano, m - 1));
  const ate = isoDeDataDoBanco(utcFimDoDia(ano, m, 0));
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: contaId }, select: { id: true, nome: true, saldoInicial: true, saldoInicialEm: true } });

  const ls = await prisma.lancamento.findMany({
    // M8: com data de saldo inicial, o que veio antes dela já está no saldo inicial.
    where: { contaId, status: "confirmado", dataConfirmacao: { lte: utcFimDoDia(ano, m, 0), ...(conta.saldoInicialEm ? { gte: conta.saldoInicialEm } : {}) } },
    // natureza-ok: o saldo de uma conta inclui toda perna de transferência — o dinheiro mexeu na conta.
    select: {
      id: true,
      tipo: true,
      descricao: true,
      valor: true,
      valorEfetivo: true,
      dataConfirmacao: true,
      createdAt: true,
      transferenciaId: true,
      formaId: true,
      contaId: true,
      pagamentoProjetistaId: true,
      categoria: { select: { codigo: true, nome: true } },
      projeto: { select: { codigo: true, nome: true } },
      transacao: { select: { id: true } },
      _count: { select: { anexos: true } },
    },
  });
  const movimentos: MovimentoDoExtrato[] = ls.map((l) => ({
    id: l.id,
    dia: isoDeDataDoBanco(l.dataConfirmacao!),
    ordem: l.createdAt.toISOString(),
    tipo: l.tipo,
    valorCentavos: paraCentavos(l.valorEfetivo ?? l.valor),
    descricao: l.descricao,
    categoria: `${l.categoria.codigo} ${l.categoria.nome}`,
    projeto: l.projeto ? `${l.projeto.codigo} · ${l.projeto.nome}` : null,
    conciliado: l.transacao != null,
    deTransferencia: l.transferenciaId != null,
    transferenciaId: l.transferenciaId,
    formaId: l.formaId,
    contaId: l.contaId,
    deProducao: l.pagamentoProjetistaId != null,
    anexos: l._count.anexos,
  }));
  const extrato = montarExtrato({ saldoInicialCentavos: paraCentavos(conta.saldoInicial), movimentos, de, ate });

  // Lançamentos realizados no mês SEM conta: não são de nenhuma conta, e o Extrato os deixa de fora — a
  // lista ao lado leva a pessoa até eles.
  const semConta = await prisma.lancamento.count({
    where: { contaId: null, status: "confirmado", dataConfirmacao: { gte: utcInicioDoDia(ano, m - 1), lte: utcFimDoDia(ano, m, 0) } },
  });

  const banco = await prisma.extratoBancario.findFirst({
    where: { contaId, saldoBancoEm: { gte: utcInicioDoDia(ano, m - 1), lte: utcFimDoDia(ano, m, 0) } },
    orderBy: [{ saldoBancoEm: "desc" }, { importadoEm: "desc" }],
    select: { saldoBanco: true, saldoBancoEm: true, importadoEm: true },
  });
  let conferencia: ConferenciaDeSaldo | null = null;
  if (banco?.saldoBanco != null && banco.saldoBancoEm) {
    const dia = isoDeDataDoBanco(banco.saldoBancoEm);
    conferencia = conferirSaldo({ dia, bancoCentavos: paraCentavos(banco.saldoBanco), sistemaCentavos: paraCentavos(await saldoDoSistema(prisma, contaId, dia)) });
  }

  return { conta: { id: conta.id, nome: conta.nome }, mes, extrato, semConta, conferencia };
}
export type DadosDoExtrato = Awaited<ReturnType<typeof extratoDaConta>>;
