/**
 * Smoke das retenções na nota (C4 da integração contábil) contra o banco de dev. Usa abril de 2019 (mês aberto) com uma
 * conta bancária de teste e confere o que o vitest não alcança, pelos MESMOS serviços que as telas usam:
 *
 *   1. Lançar: retenção recusada quando soma a nota inteira ou com repetição em meses; aceita e gravada no título.
 *   2. Pagar: parcial recusado; inteira grava um acessório por imposto (fora da DRE) e uma conta a pagar por imposto
 *      (ISS dia 10, IRRF dia 15 do mês seguinte); o banco perde só o líquido.
 *   3. Estornar: acessórios e contas dos impostos saem junto; com um imposto já recolhido, o estorno é recusado.
 *   4. Mudar a data do pagamento: a conta do imposto em aberto acompanha o vencimento novo.
 *   5. Conta a receber: a conciliação procura o líquido, casa e grava a retenção sofrida; desconciliar a desfaz.
 *   6. Contabilidade: baixa pelo líquido, D fornecedor / C imposto a recolher, D imposto a compensar / C cliente e o
 *      recolhimento D imposto a recolher / C banco.
 *   7. Lançada já paga (com a conta): a retenção acontece na criação.
 *
 * Tudo o que cria é apagado no fim (mesmo com falha). Uso: npm run smoke:retencoes
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { utcInicioDoDia } from "../src/lib/data";
import { criarLancamentoNoTx } from "../src/modules/financeiro/lancamentos/service";
import { baixarNoBanco } from "../src/modules/financeiro/lancamentos/baixa-service";
import { estornarNoBanco } from "../src/modules/financeiro/lancamentos/situacao-service";
import { corrigirPagamentoNoBanco } from "../src/modules/financeiro/lancamentos/corrigir-pagamento";
import { candidatosDeConciliacao, conciliarNoBanco, desconciliarNoBanco } from "../src/modules/financeiro/conciliacao/service";
import { diasDeVencimentoDasRetencoes } from "../src/modules/financeiro/lancamentos/retencoes-service";
import {
  MOTIVO_IMPOSTO_RECOLHIDO,
  MOTIVO_RETENCAO_DESCONTO,
  MOTIVO_RETENCAO_MAIOR,
  MOTIVO_RETENCAO_RECORRENCIA,
  motivoRetencaoParcial,
  vencimentoDoImposto,
} from "../src/modules/financeiro/lancamentos/retencoes";
import { deParaDoMotor, lancamentosDoMes } from "../src/modules/financeiro/contabil/service";
import { gerarPartidas } from "../src/modules/financeiro/contabil/partidas";
import { paraCentavos } from "../src/modules/financeiro/liquidez/dinheiro";
import { enviarCobrancasAoCliente } from "../src/modules/financeiro/avisos/service";

const MARCA = "[smoke retenções]";
const MES = "2019-04";
const dia = (d: number) => utcInicioDoDia(2019, 3, d);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

let falhas = 0;
const ok = (cond: unknown, msg: string, extra?: unknown) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ ${msg}`, extra ?? "");
  }
};
async function recusa(p: Promise<unknown>, msg: string, motivo: string) {
  try {
    await p;
    ok(false, `${msg} (não recusou)`);
  } catch (e) {
    ok(e instanceof Error && e.message === motivo, `${msg}${e instanceof Error && e.message !== motivo ? ` — veio "${e.message}"` : ""}`);
  }
}

/** Efeito no banco do que foi realizado na conta (receita soma, despesa subtrai), em centavos. */
async function movimentoNaConta(contaId: string): Promise<number> {
  const ls = await prisma.lancamento.findMany({ where: { contaId, status: "confirmado" }, select: { tipo: true, valor: true, valorEfetivo: true } });
  return ls.reduce((s, l) => s + (l.tipo === "receita" ? 1 : -1) * paraCentavos(l.valorEfetivo ?? l.valor), 0);
}

const daNota = (id: string) => ({ OR: [{ id }, { acessorioDeId: id }, { retencaoDeId: id }] });

let fornecedorId: string | null = null;
let clienteId: string | null = null;

async function limpar(contaId: string | null) {
  const nossos = await prisma.lancamento.findMany({ where: { descricao: { startsWith: MARCA } }, select: { id: true } });
  const ids = nossos.map((n) => n.id);
  if (ids.length) {
    await prisma.transacaoBancaria.updateMany({ where: { lancamentoId: { not: null }, contaId: contaId ?? "" }, data: { lancamentoId: null, conciliado: false } });
    await prisma.lancamento.deleteMany({ where: { OR: [{ acessorioDeId: { in: ids } }, { retencaoDeId: { in: ids } }] } });
    await prisma.lancamento.deleteMany({ where: { id: { in: ids } } });
  }
  if (fornecedorId) await prisma.fornecedor.deleteMany({ where: { id: fornecedorId } });
  if (clienteId) await prisma.cliente.deleteMany({ where: { id: clienteId } });
  if (contaId) {
    await prisma.extratoBancario.deleteMany({ where: { contaId } });
    await prisma.deParaContabil.deleteMany({ where: { alvo: "conta_bancaria", alvoId: contaId } });
    await prisma.contaBancaria.deleteMany({ where: { id: contaId } });
  }
}

async function main() {
  let contaId: string | null = null;
  try {
    const autor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const despesaCat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "despesa", natureza: "resultado", ativo: true, filhas: { none: {} } }, select: { id: true } });
    const receitaCat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "receita", natureza: "resultado", ativo: true, filhas: { none: {} } }, select: { id: true } });
    const fornecedor = await prisma.fornecedor.create({ data: { nome: `${MARCA} Engecalc` }, select: { id: true, nome: true } });
    fornecedorId = fornecedor.id;
    const cliente = await prisma.cliente.create({ data: { nome: `${MARCA} Construtora Alfa`, email: "alfa@exemplo.invalid" }, select: { id: true } });
    clienteId = cliente.id;
    const centro = await prisma.centroCusto.findFirst({ select: { id: true } });
    const forma = await prisma.formaPagamento.findFirst({ select: { id: true } });
    const projeto = await prisma.projeto.findFirst({ select: { id: true } });
    const conta = await prisma.contaBancaria.create({ data: { nome: `${MARCA} Banco`, saldoInicial: 0 }, select: { id: true } });
    contaId = conta.id;
    const dias = await diasDeVencimentoDasRetencoes();
    // Campos que a configuração pode exigir: todos preenchidos, para o smoke não depender dela.
    const comuns = {
      centroId: centro?.id ?? "",
      formaId: forma?.id ?? "",
      projetoId: projeto?.id ?? "",
      observacao: "smoke",
      vencimento: "",
      dataCompetencia: "",
      contaId: "",
      numeroDocumento: "NF 1207",
      chaveNfe: "",
      confirmado: false,
      ocorrencias: 1,
    };
    const nota = (p: Partial<Parameters<typeof criarLancamentoNoTx>[1]> = {}) =>
      criarLancamentoNoTx(
        prisma,
        {
          ...comuns,
          tipo: "despesa",
          descricao: `${MARCA} Projeto de fundações`,
          valor: 10000,
          data: "2019-04-20",
          categoriaId: despesaCat.id,
          fornecedorId: fornecedor.id,
          clienteId: "",
          retencoes: [{ imposto: "iss", valor: 500 }, { imposto: "irrf", valor: 150 }],
          ...p,
        },
        autor.id,
      );

    console.log("1 · lançar a nota com retenção");
    await recusa(nota({ retencoes: [{ imposto: "iss", valor: 10000 }] }), "retenção que soma a nota inteira é recusada", MOTIVO_RETENCAO_MAIOR);
    await recusa(nota({ ocorrencias: 3 }), "retenção não se repete nos meses seguintes", MOTIVO_RETENCAO_RECORRENCIA);
    const criada = await nota();
    const id = criada.id!;
    const gravadas = await prisma.retencaoLancamento.findMany({ where: { lancamentoId: id }, orderBy: { imposto: "asc" } });
    ok(gravadas.length === 2 && Number(gravadas.find((g) => g.imposto === "iss")?.valor) === 500, "as retenções moram no título", gravadas);
    if (criada.status !== "previsto") throw new Error(`a nota nasceu ${criada.status} (alçada?) — o smoke precisa dela em aberto`);

    console.log("2 · pagar");
    await recusa(baixarNoBanco({ id, contaId, data: dia(20), principal: 5000 }, autor.id), "pagamento parcial com retenção é recusado", motivoRetencaoParcial("despesa"));
    await recusa(baixarNoBanco({ id, contaId, data: dia(20), desconto: 9400 }, autor.id), "desconto que deixaria o retido maior que o pago é recusado", MOTIVO_RETENCAO_DESCONTO);
    ok((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).status === "previsto", "a recusa desfaz tudo: a nota continua em aberto");
    const antes = await movimentoNaConta(contaId);
    const baixa = await baixarNoBanco({ id, contaId, formaId: forma?.id, data: dia(20) }, autor.id);
    ok(baixa.caixa === 9350 && baixa.impostosARecolher === 2, "a baixa devolve o líquido e duas contas de imposto", baixa);
    ok((await movimentoNaConta(contaId)) - antes === -9350_00, "o banco perde só o líquido (R$ 9.350,00)");
    const acessorios = await prisma.lancamento.findMany({ where: { acessorioDeId: id }, include: { categoria: { select: { chave: true, natureza: true } } } });
    ok(
      acessorios.length === 2 && acessorios.every((a) => a.tipo === "receita" && a.status === "confirmado" && a.categoria.chave === "receita_retencao_feita" && a.categoria.natureza === "fora_do_resultado"),
      "um acessório RECEITA por imposto, fora da DRE, na conta do pagamento",
    );
    const impostos = await prisma.lancamento.findMany({ where: { retencaoDeId: id }, orderBy: { retencaoImposto: "asc" } });
    const iss = impostos.find((x) => x.retencaoImposto === "iss");
    const irrf = impostos.find((x) => x.retencaoImposto === "irrf");
    ok(
      iss && irrf && iss.status === "previsto" && Number(iss.valor) === 500 && iso(iss.vencimento) === vencimentoDoImposto("2019-04-20", dias.iss) && iso(irrf.vencimento) === vencimentoDoImposto("2019-04-20", dias.irrf),
      `contas dos impostos: ISS vence ${vencimentoDoImposto("2019-04-20", dias.iss)}, IRRF ${vencimentoDoImposto("2019-04-20", dias.irrf)}`,
      impostos.map((x) => [x.retencaoImposto, iso(x.vencimento), Number(x.valor)]),
    );

    console.log("4 · corrigir a data do pagamento");
    // A data nova não pode ser futura: corrige para 18/04 e confere o vencimento recalculado (mesmo mês seguinte).
    await corrigirPagamentoNoBanco({ id, contaId, formaId: forma?.id ?? null, dataConfirmacao: "2019-04-18" });
    const issCorrigido = await prisma.lancamento.findUniqueOrThrow({ where: { id: iss!.id } });
    ok(iso(issCorrigido.data) === "2019-04-18" && iso(issCorrigido.vencimento) === vencimentoDoImposto("2019-04-18", dias.iss), "a conta do imposto acompanha a data nova");

    console.log("6 · contabilidade (antes do estorno)");
    const dp = await deParaDoMotor();
    const daqui = (await lancamentosDoMes(MES)).filter((l) => l.id === id || l.acessorioDeId === id || l.retencaoDeId === id);
    const resumo = gerarPartidas(MES, daqui, { ...dp, contaBancaria: { ...dp.contaBancaria, [contaId]: 3395 } });
    const baixaLinha = resumo.linhas.find((l) => l.evento === "baixa" && l.lancamentoId === id);
    ok(baixaLinha?.valorCentavos === 9350_00 && baixaLinha.credito === 3395, "baixa da nota pelo líquido contra o banco", baixaLinha);
    const linhaIrrf = resumo.linhas.find((l) => l.lancamentoId === acessorios.find((a) => a.retencaoImposto === "irrf")?.id);
    ok(linhaIrrf?.credito === 2163 && linhaIrrf.valorCentavos === 150_00 && linhaIrrf.debito === baixaLinha?.debito, "IRRF: D fornecedor / C IR a recolher (2163)", linhaIrrf);
    ok(resumo.linhas.every((l) => l.lancamentoId !== iss!.id), "a conta do imposto em aberto não gera partida (a obrigação nasceu na retenção)");

    console.log("3 · estornar");
    await baixarNoBanco({ id: iss!.id, contaId, data: dia(25) }, autor.id);
    await recusa(estornarNoBanco(id, autor.id), "imposto já recolhido: o estorno da nota é recusado", MOTIVO_IMPOSTO_RECOLHIDO);
    const recolhimento = gerarPartidas(MES, (await lancamentosDoMes(MES)).filter((l) => l.id === iss!.id), { ...dp, impostoRecolher: { ...dp.impostoRecolher, iss: 9002 }, contaBancaria: { ...dp.contaBancaria, [contaId]: 3395 } });
    ok(recolhimento.linhas.length === 1 && recolhimento.linhas[0].debito === 9002 && recolhimento.linhas[0].credito === 3395, "recolhimento: D ISS a recolher / C banco", recolhimento.linhas);
    await estornarNoBanco(iss!.id, autor.id);
    await estornarNoBanco(id, autor.id);
    ok((await prisma.lancamento.count({ where: { ...daNota(id), excluidoEm: null, NOT: { id } } })) === 0, "estornado: acessórios e contas dos impostos saem junto");
    ok((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).status === "previsto", "a nota volta a ficar em aberto, com as retenções guardadas");
    ok((await movimentoNaConta(contaId)) === antes, "o banco volta ao que era");

    console.log("5 · conta a receber pela conciliação");
    const rec = await criarLancamentoNoTx(
      prisma,
      {
        ...comuns,
        tipo: "receita",
        descricao: `${MARCA} Parcela 1/3`,
        valor: 45000,
        data: "2019-04-12",
        vencimento: "2019-04-12",
        categoriaId: receitaCat.id,
        fornecedorId: "",
        projetoId: "",
        clienteId: cliente.id,
        numeroDocumento: "NF 3381",
        retencoes: [{ imposto: "iss", valor: 900 }],
      },
      autor.id,
    );
    // Cobrança D+1 ao cliente: o e-mail cobra o líquido (o cliente paga a nota menos o que ele retém).
    const enviados: Record<string, string>[] = [];
    await enviarCobrancasAoCliente({ hoje: "2019-04-13", enviar: async (_para, _slug, v) => (enviados.push(v), true) });
    const cobranca = enviados.find((v) => v.descricao === `${MARCA} Parcela 1/3`);
    ok(cobranca?.valor.replace(/\s/g, " ") === "R$ 44.100,00", "o e-mail de cobrança pede o líquido (R$ 44.100,00)", cobranca);
    const candidato = (await candidatosDeConciliacao(prisma)).find((c) => c.id === rec.id);
    ok(candidato?.valorCentavos === 44100_00, "a conciliação procura o líquido (R$ 44.100,00)", candidato);
    const extrato = await prisma.extratoBancario.create({ data: { contaId, nomeArquivo: `${MARCA}.ofx` } });
    const t = await prisma.transacaoBancaria.create({ data: { extratoId: extrato.id, contaId, fitid: "smoke-ret-1", data: dia(12), valor: 44100, descricao: "TED CLIENTE" } });
    await conciliarNoBanco(t.id, rec.id!, autor.id);
    const sofrida = await prisma.lancamento.findFirst({ where: { acessorioDeId: rec.id!, excluidoEm: null }, include: { categoria: { select: { chave: true } } } });
    ok(sofrida?.tipo === "despesa" && sofrida.categoria.chave === "despesa_retencao_sofrida" && Number(sofrida.valor) === 900, "conciliar grava a retenção sofrida (despesa fora da DRE)");
    ok((await prisma.lancamento.count({ where: { retencaoDeId: rec.id!, excluidoEm: null } })) === 0, "conta a receber não gera conta de imposto");
    const contabil = gerarPartidas(MES, (await lancamentosDoMes(MES)).filter((l) => l.id === rec.id || l.acessorioDeId === rec.id), { ...dp, impostoCompensar: { iss: 9003 }, contaBancaria: { ...dp.contaBancaria, [contaId]: 3395 } });
    const comp = contabil.linhas.find((l) => l.lancamentoId === sofrida?.id);
    const recebimento = contabil.linhas.find((l) => l.lancamentoId === rec.id && l.evento === "baixa");
    ok(recebimento?.valorCentavos === 44100_00 && comp?.debito === 9003 && comp.credito === recebimento.credito, "D banco 44.100 / D ISS a compensar 900 / C cliente", { recebimento, comp });
    await desconciliarNoBanco(t.id, autor.id);
    ok((await prisma.lancamento.count({ where: { acessorioDeId: rec.id!, excluidoEm: null } })) === 0, "desconciliar desfaz a retenção junto com o recebimento");

    console.log("7 · lançada já paga");
    const paga = await nota({ descricao: `${MARCA} Nota já paga`, confirmado: true, contaId, retencoes: [{ imposto: "inss", valor: 1100 }] });
    ok(paga.status === "confirmado", "nasce paga");
    ok((await prisma.lancamento.count({ where: { retencaoDeId: paga.id!, retencaoImposto: "inss", status: "previsto" } })) === 1, "e a conta do INSS retido nasce junto");
  } finally {
    await limpar(contaId);
    await prisma.$disconnect();
  }
  if (falhas) {
    console.error(`\n${falhas} falha(s).`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
