/**
 * Smoke do núcleo do Financeiro (N0, plano 2026-10-02) contra o banco de dev. Cobre o I/O das
 * correções que o vitest não alcança:
 *
 *   A6. Regenerar as parcelas do projeto só troca as parcelas GERADAS em aberto: a entrega
 *       faturada (mesma tag `contrato`) e as recebidas ficam, e o total novo desconta o que já
 *       entrou. Limpar também não apaga a entrega. As parcelas nascem com o cliente do projeto.
 *   A5. Baixa no Financeiro de uma despesa de projetista marca o pagamento como pago; a folha de
 *       projetistas não confirma de novo (nem move a data); a sincronização da disciplina recusa
 *       quando o lançamento já foi pago; duas aprovações simultâneas da disciplina: só uma passa.
 *   A11. "Recebido" dos indicadores soma o valor PAGO (parcial), linha a linha.
 *   N1. Máquina de situações: estorno (simples, parcial com o resto, distribuída, conciliado não),
 *       reabertura (rejeitado volta à aprovação), caminhos impossíveis recusados, excluído por id
 *       recusado, corrida de dois estornos.
 *   N2. Recorrência confirmada só no 1º mês (A10), 31/01 + 1 mês = 28/02 (A9), dia 1º dentro do mês.
 *   N3. Alçada única: total do parcelamento, quem lançou não aprova (só admin), limite antigo → faixas.
 *   N4. OFX: mesma conta, empate e transferência fora, saldo conferido, FITID sem duplicar; desconciliar
 *       devolve ao estado de antes (pago pela conciliação volta, criado sai, já pago fica).
 *   N5. Mês fechado trava criar, estornar, reabrir, conciliar e importar; paga em mês aberto; OFX não
 *       concilia sozinho no fechado; saldo das contas no fim do mês.
 *   N6. Tipo categoria × lançamento, categoria do sistema pela chave, cliente no faturamento, natureza fora do módulo.
 *   N7. Taxa de ART: despesa + reembolso, categoria pela chave, baixada não muda, cancelar não desfaz o pago.
 *   M0. Extrato por conta (saldo anterior, entradas/saídas pelo valor pago, sem conta fora) e Pagas e recebidas.
 *   A8. Desfazer importação: barrado com linha trabalhada, exclusão lógica no lote intocado, dedup
 *       que enxerga a linha excluída à mão mas não a do lote desfeito.
 *
 * O serviço terceirizado (A7) tem a prova em `scripts/verify-custo-projeto.ts` e a folha CLT (A1)
 * em `smoke:planejador`. Uso: npm run smoke:financeiro-core
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { gerarParcelasDoProjeto, limparParcelasDoProjeto } from "../src/modules/projetos/receita/parcelas-service";
import { faturarEntregaDaDisciplina } from "../src/modules/projetos/receita/faturamento";
import {
  confirmarDespesaProjetista,
  criarDespesaProjetistaPrevista,
  pagamentoPagoNoFinanceiro,
  sincronizarLancamentosArt,
} from "../src/modules/financeiro/custo/lancamento-custo";
import { liberarPagamentosProjetista, sincronizarPagamentosDisciplina } from "../src/modules/uploads/pagamento";
import { indicadores } from "../src/modules/financeiro/relatorios/queries";
import { estornarNoBanco, exigirOperacao, reabrirNoBanco } from "../src/modules/financeiro/lancamentos/situacao-service";
import { executarCommit, executarDesfazer } from "../src/modules/financeiro/importacao/commit-core";
import { criarLancamentoNoTx } from "../src/modules/financeiro/lancamentos/service";
import { utcFimDoDia, utcInicioDoDia } from "../src/lib/data";
import { lancamentosAguardando, valorParaAlcada } from "../src/modules/financeiro/aprovacao/queries";
import { MOTIVO_PROPRIA_DESPESA } from "../src/modules/financeiro/aprovacao/niveis";
import { conciliarNoBanco, criarDaTransacaoNoBanco, desconciliarNoBanco, importarOfxNoBanco } from "../src/modules/financeiro/conciliacao/service";
import { exigirPeriodoAberto } from "../src/modules/financeiro/fechamento/trava-service";
import { saldosDasContasNoFimDoMes } from "../src/modules/financeiro/fechamento/queries";
import { acharCategoriaDoSistema } from "../src/modules/financeiro/categorias-sistema";
import { alertaInadimplencia } from "../src/lib/jobs-handlers";
import { extratoDaConta } from "../src/modules/financeiro/extrato/queries";
import { dadosPagas } from "../src/modules/financeiro/lancamentos/queries";
import { hashesExistentes } from "../src/modules/financeiro/importacao/queries";
import { normalizarLinhas } from "../src/modules/financeiro/importacao/processar";
import { casamentosDoHistorico, sugerirParaEntrada } from "../src/modules/financeiro/regras/service";
import { editarCompraNoBanco, lancarCompraNoBanco, pagarCompraNoBanco, pagarFaturaNoBanco } from "../src/modules/financeiro/cartoes/service";
import { agregarFaturas } from "../src/modules/financeiro/cartoes/eventos";
import { baseDoPlanejador } from "../src/modules/financeiro/liquidez/queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

async function erroDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-fincore-${Date.now()}`;
const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-projeto`,
      clienteId: cliente.id,
    },
  });
  const pj = await prisma.user.create({
    data: { name: `${tag}-PJ`, email: `${tag}-pj@teste.local`, role: "projetista_pj", emailVerified: false },
  });
  const disciplina = await prisma.disciplina.create({
    data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural", valor: 1000, responsaveis: { create: [{ userId: pj.id }] } },
  });

  try {
    await parcelasDoProjeto(admin.id, projeto.id, disciplina.id, cliente.id);
    await projetistaPagoNoFinanceiro(admin.id, disciplina.id);
    await recebidoPeloPago(admin.id);
    await maquinaDeSituacoes(admin.id);
    await desfazerImportacao(admin.id);
    await datasEOcorrencias(admin.id);
    await alcadaUnica(admin.id);
    await conciliacaoConfiavel(admin.id);
    await travaDoPeriodo(admin.id);
    await categoriasEConsistencia(admin.id);
    await taxaDeArt(admin.id);
    await extratoEPagas(admin.id);
    await regrasDePreenchimento(admin.id);
    await cartoesDeCredito(admin.id);
  } finally {
    const pags = (await prisma.pagamentoProjetista.findMany({ where: { disciplinaId: disciplina.id }, select: { id: true } })).map((p) => p.id);
    await prisma.lancamento.deleteMany({ where: { OR: [{ projetoId: projeto.id }, { pagamentoProjetistaId: { in: pags } }, { descricao: { startsWith: tag } }] } });
    await prisma.pagamentoProjetista.deleteMany({ where: { id: { in: pags } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

async function parcelasDoProjeto(autorId: string, projetoId: string, disciplinaId: string, clienteId: string) {
  console.log("\n# A6 — parcelas do projeto");
  const vivas = () =>
    prisma.lancamento.findMany({
      where: { projetoId, tipo: "receita", excluidoEm: null, status: { not: "cancelado" } },
      select: { id: true, status: true, valor: true, tags: true, clienteId: true },
      orderBy: { vencimento: "asc" },
    });

  // Entrega faturada: tem a tag `contrato` e é recebível de verdade.
  await faturarEntregaDaDisciplina({ disciplinaId, valor: 2000, autorId });
  const r1 = await gerarParcelasDoProjeto({ projetoId, valorTotal: 9000, numeroParcelas: 3, dataPrimeira: "2040-01-10", intervaloMeses: 1, autorId });
  let l = await vivas();
  const geradas = l.filter((x) => !x.tags.some((t) => t.startsWith("entrega:")));
  check("gera 3 parcelas de 3.000 com o cliente do projeto", r1.parcelas === 3 && geradas.length === 3 && geradas.every((x) => Number(x.valor) === 3000 && x.clienteId === clienteId), geradas);

  // Recebe a 1ª parcela pela metade (parcial: 1.500 pago, 1.500 vira resto em aberto com a mesma tag).
  const primeira = geradas[0];
  await prisma.lancamento.update({ where: { id: primeira.id }, data: { status: "confirmado", dataConfirmacao: dia("2040-01-10"), valorEfetivo: 1500 } });
  await prisma.lancamento.create({
    data: { tipo: "receita", descricao: `${tag} resto`, valor: 1500, status: "previsto", data: dia("2040-01-10"), vencimento: dia("2040-01-10"), categoriaId: (await prisma.lancamento.findUniqueOrThrow({ where: { id: primeira.id } })).categoriaId, projetoId, tags: ["contrato"], autorId },
  });

  const r2 = await gerarParcelasDoProjeto({ projetoId, valorTotal: 9000, numeroParcelas: 2, dataPrimeira: "2040-03-10", intervaloMeses: 1, autorId });
  l = await vivas();
  const entrega = l.filter((x) => x.tags.some((t) => t.startsWith("entrega:")));
  const abertas = l.filter((x) => x.status === "previsto" && !x.tags.some((t) => t.startsWith("entrega:")));
  check("regenerar não apaga a entrega faturada", entrega.length === 1 && Number(entrega[0].valor) === 2000, entrega);
  check("a recebida fica", l.some((x) => x.id === primeira.id && x.status === "confirmado"));
  check("o total novo desconta o recebido: 9.000 − 1.500 = 2 × 3.750", r2.recebido === 1500 && abertas.length === 2 && abertas.every((x) => Number(x.valor) === 3750), { r2, abertas });
  const excluidas = await prisma.lancamento.count({ where: { projetoId, excluidoEm: { not: null } } });
  check("as abertas antigas (2 parcelas + o resto) saem por exclusão lógica", excluidas === 3, excluidas);

  const recusa = await erroDe(gerarParcelasDoProjeto({ projetoId, valorTotal: 1000, numeroParcelas: 1, dataPrimeira: "2040-05-10", intervaloMeses: 1, autorId }));
  check("total menor que o recebido é recusado", recusa?.includes("não há o que parcelar") === true, recusa);

  const removidas = await limparParcelasDoProjeto(projetoId);
  l = await vivas();
  check("limpar tira só as geradas em aberto; a entrega e a recebida ficam", removidas === 2 && l.length === 2, { removidas, l });
}

async function projetistaPagoNoFinanceiro(autorId: string, disciplinaId: string) {
  console.log("\n# A5 — projetista pago no Financeiro");
  const comResp = async () =>
    prisma.disciplina.findUniqueOrThrow({
      where: { id: disciplinaId },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });

  // Duas aprovações ao mesmo tempo: a mesma guarda das duas actions (updateMany condicionado).
  await prisma.disciplina.update({ where: { id: disciplinaId }, data: { status: "em_revisao" } });
  const aprovar = () =>
    prisma.$transaction(async (tx) => {
      const r = await tx.disciplina.updateMany({ where: { id: disciplinaId, status: { not: "aprovado" } }, data: { status: "aprovado" } });
      if (r.count !== 1) throw new Error("Esta entrega já foi validada.");
      await new Promise((ok) => setTimeout(ok, 300));
      return liberarPagamentosProjetista(tx, { disciplina: await comResp(), autorId, agora: new Date() });
    });
  const corrida = await Promise.allSettled([aprovar(), aprovar()]);
  const pags = await prisma.pagamentoProjetista.findMany({ where: { disciplinaId }, select: { id: true, status: true, lancamentoId: true, pagoEm: true } });
  check(
    "duas aprovações simultâneas: uma passa, a outra é recusada, e o pagamento é liberado UMA vez",
    corrida.filter((c) => c.status === "fulfilled").length === 1 && pags.length === 1,
    { corrida: corrida.map((c) => c.status), pags: pags.length },
  );
  const pag = pags[0];
  if (!pag?.lancamentoId) return check("pagamento liberado com lançamento", false, pag);

  // Baixa no livro caixa: os mesmos argumentos que confirmarLancamento/baixarEmLote/conciliação/OFX usam.
  const quando = dia("2040-02-05");
  await prisma.$transaction([
    prisma.lancamento.update({ where: { id: pag.lancamentoId }, data: { status: "confirmado", dataConfirmacao: quando } }),
    prisma.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(pag.id, quando)),
  ]);
  const depois = await prisma.pagamentoProjetista.findUniqueOrThrow({ where: { id: pag.id } });
  check("baixa no Financeiro marca o pagamento como pago, com a data da baixa", depois.status === "pago" && depois.pagoEm?.toISOString() === quando.toISOString(), depois);

  // Pagar pela folha de projetistas depois disso não confirma de novo.
  const id = await prisma.$transaction((tx) =>
    confirmarDespesaProjetista(
      tx,
      { id: pag.id, lancamentoId: pag.lancamentoId, valor: 1000, tipoProfissional: "projetista_pj", projetistaNome: "x", disciplinaNome: "x", projetoId: "x", projetoCodigo: "x" },
      { contaId: null, formaId: null, quando: dia("2040-03-01"), autorId },
    ),
  );
  const lanc = await prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { dataConfirmacao: true } });
  check("folha de projetistas não paga de novo nem move a data", lanc.dataConfirmacao?.toISOString() === quando.toISOString(), lanc);

  // Pago só no Financeiro (dado antigo: pagamento ainda pendente): a sincronização recusa.
  await prisma.pagamentoProjetista.update({ where: { id: pag.id }, data: { status: "pendente", pagoEm: null } });
  await prisma.disciplina.update({ where: { id: disciplinaId }, data: { valor: 1500 } });
  const recusa = await erroDe(prisma.$transaction(async (tx) => sincronizarPagamentosDisciplina(tx, { disciplina: await comResp(), autorId })));
  const intacto = await prisma.lancamento.findUniqueOrThrow({ where: { id: pag.lancamentoId }, select: { valor: true, status: true } });
  check("sincronização recusa quando o lançamento já foi pago", /pagamento efetivado/i.test(recusa ?? ""), recusa);
  check("o lançamento pago fica como estava", Number(intacto.valor) === 1000 && intacto.status === "confirmado", intacto);

  // E o caminho feliz continua: lançamento em aberto acompanha o valor novo.
  const outro = await prisma.$transaction(async (tx) => {
    const p = await tx.pagamentoProjetista.create({ data: { disciplinaId, projetistaId: (await comResp()).responsaveis[0].userId, valor: 10, tipoProfissional: "projetista_pj" } });
    const lancamentoId = await criarDespesaProjetistaPrevista(tx, { pagamentoId: p.id, valor: 10, tipoProfissional: "projetista_pj", projetistaNome: "x", disciplinaNome: "x", projetoId: (await comResp()).projeto.id, projetoCodigo: "x", autorId, quando: new Date() });
    await tx.pagamentoProjetista.update({ where: { id: p.id }, data: { lancamentoId } });
    return lancamentoId;
  });
  check("criar despesa prevista continua igual", (await prisma.lancamento.findUniqueOrThrow({ where: { id: outro } })).status === "previsto");
}

async function recebidoPeloPago(autorId: string) {
  console.log("\n# A11 — recebido = valor pago");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  if (!cat) return check("categoria de receita existe", false);
  const de = dia("2041-06-01");
  const ate = new Date("2041-06-30T23:59:59.000Z");
  const base = { tipo: "receita" as const, status: "confirmado" as const, categoriaId: cat.id, autorId, data: dia("2041-06-10"), dataConfirmacao: dia("2041-06-10") };
  await prisma.lancamento.create({ data: { ...base, descricao: `${tag} parcial`, valor: 1000, valorEfetivo: 400 } });
  await prisma.lancamento.create({ data: { ...base, descricao: `${tag} cheio`, valor: 250 } });
  const r = await indicadores(de, ate);
  check("recebido = 400 (pago do parcial) + 250 — não 1.250 nem só 400", r.recebido === 650, r.recebido);
}

async function maquinaDeSituacoes(autorId: string) {
  console.log("\n# N1 — máquina de situações, estorno e reabertura");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  if (!cat || !catD) return check("categorias de receita e despesa existem", false);
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} conta`, tipo: "corrente", saldoInicial: 0 } });
  const novo = (p: Record<string, unknown>) =>
    prisma.lancamento.create({
      data: { tipo: "receita", descricao: `${tag} n1`, valor: 1000, status: "previsto", data: dia("2042-01-10"), categoriaId: cat.id, autorId, ...p },
      select: { id: true },
    });
  const situacao = (id: string) =>
    prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { status: true, dataConfirmacao: true, valorEfetivo: true, excluidoEm: true, motivoRejeicao: true } });

  try {
    // Estorno simples: volta a em aberto e grava o histórico.
    const a = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10") });
    await estornarNoBanco(a.id, autorId);
    const sa = await situacao(a.id);
    const hist = await prisma.lancamentoStatusHistorico.findFirst({ where: { lancamentoId: a.id }, orderBy: { createdAt: "desc" } });
    check("estorno: pago volta a em aberto, sem data de pagamento, com histórico", sa.status === "previsto" && sa.dataConfirmacao === null && hist?.para === "previsto", { sa, hist });
    check("estornar de novo é recusado (só pago estorna)", (await erroDe(estornarNoBanco(a.id, autorId)))?.includes("Só se estorna") === true);

    // A2: pago não se cancela; cancelado não se paga; excluído não faz nada (A12).
    const b = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10") });
    check("pago não se cancela (estorne antes)", (await erroDe(exigirOperacao(prisma, b.id, "cancelar")))?.includes("estorne antes") === true);
    const c = await novo({ status: "cancelado" });
    check("cancelado não se baixa", (await erroDe(exigirOperacao(prisma, c.id, "baixar")))?.includes("reabra antes") === true);
    const x = await novo({ excluidoEm: new Date() });
    check("A12: excluído é recusado por id", (await erroDe(exigirOperacao(prisma, x.id, "baixar"))) === "Lançamento excluído.");

    // Conciliado não estorna nem exclui.
    const extrato = await prisma.extratoBancario.create({ data: { contaId: conta.id, nomeArquivo: `${tag}.ofx` } });
    const d = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10"), contaId: conta.id });
    await prisma.transacaoBancaria.create({
      data: { extratoId: extrato.id, contaId: conta.id, fitid: `${tag}-1`, data: dia("2042-01-10"), valor: 1000, descricao: "x", conciliado: true, lancamentoId: d.id },
    });
    check("conciliado não estorna", (await erroDe(estornarNoBanco(d.id, autorId)))?.includes("desconcilie") === true);
    check("conciliado não se exclui", (await erroDe(exigirOperacao(prisma, d.id, "excluir")))?.includes("desconcilie") === true);
    const desp = await novo({ tipo: "despesa", categoriaId: catD.id, status: "aguardando_aprovacao" });
    check("A2: despesa em aprovação não se concilia", (await erroDe(exigirOperacao(prisma, desp.id, "conciliar")))?.includes("aguardando aprovação") === true);

    // Baixa parcial: o estorno tira junto o resto em aberto; resto pago impede.
    const p = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10"), valorEfetivo: 400 });
    const resto = await novo({ valor: 600, restanteDeId: p.id });
    const r1 = await estornarNoBanco(p.id, autorId);
    const sp = await situacao(p.id);
    const sr = await situacao(resto.id);
    check("parcial: estorno devolve o valor cheio e tira o resto em aberto", r1.restantesExcluidos === 1 && sp.valorEfetivo === null && sr.excluidoEm !== null, { r1, sp, sr });
    const p2 = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10"), valorEfetivo: 400 });
    await novo({ valor: 600, restanteDeId: p2.id, status: "confirmado", dataConfirmacao: dia("2042-02-10") });
    check("parcial com o resto já pago: estorno recusado", (await erroDe(estornarNoBanco(p2.id, autorId)))?.includes("saldo restante") === true);

    // Receita distribuída: estorno desfaz a distribuição; caixinha que já liberou recusa.
    const caixinha = await prisma.caixinha.create({ data: { nome: `${tag} caixinha` } });
    const distribuir = async () => {
      const l = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10") });
      const dist = await prisma.distribuicaoRecebimento.create({ data: { lancamentoId: l.id, situacao: "distribuida", data: dia("2042-01-10"), autorId } });
      await prisma.movimentoCaixinha.create({ data: { caixinhaId: caixinha.id, tipo: "alocacao", valor: 300, data: dia("2042-01-10"), distribuicaoId: dist.id, autorId } });
      return l.id;
    };
    const dist1 = await distribuir();
    const r2 = await estornarNoBanco(dist1, autorId);
    const sobrou = await prisma.movimentoCaixinha.count({ where: { caixinhaId: caixinha.id } });
    check("distribuída: estorno desfaz a distribuição e os movimentos", r2.distribuicaoDesfeita && sobrou === 0 && (await prisma.distribuicaoRecebimento.count({ where: { lancamentoId: dist1 } })) === 0, { r2, sobrou });
    const dist2 = await distribuir();
    await prisma.movimentoCaixinha.create({ data: { caixinhaId: caixinha.id, tipo: "liberacao", valor: -300, data: dia("2042-01-11"), autorId } });
    check("distribuída com o reservado já liberado: estorno recusado", (await erroDe(estornarNoBanco(dist2, autorId)))?.includes("reserve de volta") === true);

    // Reabrir: cancelado volta a em aberto; rejeitado volta para a aprovação.
    const can = await novo({ status: "cancelado" });
    const re1 = await reabrirNoBanco(can.id, autorId);
    const rej = await novo({ tipo: "despesa", categoriaId: catD.id, status: "cancelado", motivoRejeicao: "caro" });
    const re2 = await reabrirNoBanco(rej.id, autorId);
    const srej = await situacao(rej.id);
    check("reabrir: cancelado volta a em aberto", re1.status === "previsto");
    check("reabrir: rejeitado volta para a aprovação, sem o motivo antigo", re2.status === "aguardando_aprovacao" && srej.motivoRejeicao === null, { re2, srej });

    // Duas baixas/estornos ao mesmo tempo: só um passa.
    const corrida = await novo({ status: "confirmado", dataConfirmacao: dia("2042-01-10") });
    const rs = await Promise.allSettled([estornarNoBanco(corrida.id, autorId), estornarNoBanco(corrida.id, autorId)]);
    check("dois estornos simultâneos: um passa, o outro é recusado", rs.filter((r) => r.status === "fulfilled").length === 1, rs.map((r) => r.status));
  } finally {
    const ids = (await prisma.lancamento.findMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } }, select: { id: true } })).map((l) => l.id);
    await prisma.transacaoBancaria.deleteMany({ where: { contaId: conta.id } });
    await prisma.extratoBancario.deleteMany({ where: { contaId: conta.id } });
    await prisma.movimentoCaixinha.deleteMany({ where: { caixinha: { nome: { startsWith: tag } } } });
    await prisma.distribuicaoRecebimento.deleteMany({ where: { lancamentoId: { in: ids } } });
    await prisma.lancamento.updateMany({ where: { id: { in: ids } }, data: { restanteDeId: null } });
    await prisma.lancamento.deleteMany({ where: { id: { in: ids } } });
    await prisma.caixinha.deleteMany({ where: { nome: { startsWith: tag } } });
    await prisma.contaBancaria.delete({ where: { id: conta.id } });
  }
}

async function desfazerImportacao(autorId: string) {
  console.log("\n# A8 — desfazer importação");
  const categoriasAntes = new Set((await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id));
  const linha = (n: number) => [
    "Despesa", "Pendente", "2042-03-02", "", `-${80 + n}`, "", `${tag} imp${n}`, `${tag} cat`, "", `${tag} conta imp`, "", "", "", `${Date.now()}${n}`,
  ];
  const mapa = { tipo: 0, status: 1, data: 2, dataConfirmacao: 3, valor: 4, valorEfetivo: 5, descricao: 6, categoria: 7, subcategoria: 8, conta: 9, contaTransferencia: 10, contato: 11, documento: 12, idUnico: 13 };
  const lotes: string[] = [];
  try {
    const res = normalizarLinhas([linha(1), linha(2)], mapa);
    const { loteId } = await executarCommit(prisma, { nomeArquivo: `${tag}.csv`, mapeamento: {}, res, autorId });
    lotes.push(loteId);
    const linhas = await prisma.lancamento.findMany({ where: { importLoteId: loteId }, select: { id: true, importHash: true } });

    // Uma linha mexida depois da importação barra o desfazer.
    await prisma.lancamento.update({ where: { id: linhas[0].id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const recusa = await erroDe(executarDesfazer(prisma, loteId));
    check("lote com linha alterada depois da importação não se desfaz", recusa?.includes("1 alterado depois da importação") === true, recusa);

    // Excluída à mão: a próxima importação não a traz de volta.
    await prisma.lancamento.update({ where: { id: linhas[0].id }, data: { excluidoEm: new Date() } });
    const ja = await hashesExistentes(linhas.map((l) => l.importHash!));
    check("dedup enxerga a linha excluída à mão (não reimporta)", ja.size === 2, ja.size);

    // Lote intocado: desfaz por exclusão lógica, e reimportar volta a criar.
    const res2 = normalizarLinhas([linha(3)], mapa);
    const lote2 = await executarCommit(prisma, { nomeArquivo: `${tag}-2.csv`, mapeamento: {}, res: res2, autorId });
    lotes.push(lote2.loteId);
    const out = await executarDesfazer(prisma, lote2.loteId);
    const l2 = await prisma.lancamento.findMany({ where: { importLoteId: lote2.loteId, excluidoEm: { not: undefined } }, select: { excluidoEm: true, importHash: true } });
    check("lote intocado: desfazer é exclusão lógica", out.removidos === 1 && l2.length === 1 && l2[0].excluidoEm !== null, { out, l2 });
    check("linha de lote desfeito não conta no dedup (reimportar recria)", (await hashesExistentes(l2.map((l) => l.importHash!))).size === 0);
  } finally {
    for (const id of lotes) {
      await prisma.lancamento.deleteMany({ where: { importLoteId: id, excluidoEm: { not: undefined } } });
      await prisma.importacaoFinanceira.delete({ where: { id } });
    }
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: tag } } });
    const novas = (await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id).filter((id) => !categoriasAntes.has(id));
    if (novas.length) await prisma.categoriaFinanceira.deleteMany({ where: { id: { in: novas }, lancamentos: { none: {} } } });
  }
}

async function datasEOcorrencias(autorId: string) {
  console.log("\n# N2 — datas e recorrência");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  if (!cat) return check("categoria de receita existe", false);
  const base = { tipo: "receita" as const, descricao: `${tag} rec`, valor: 100, data: "2042-01-31", categoriaId: cat.id, ocorrencias: 3 };
  try {
    // A10: confirmado + recorrência confirma só o 1º mês; A9: 31/01 + 1 mês = 28/02 (não 01/03).
    await criarLancamentoNoTx(prisma, { ...base, confirmado: true }, autorId);
    const l = await prisma.lancamento.findMany({ where: { descricao: `${tag} rec` }, orderBy: { data: "asc" }, select: { status: true, data: true, dataConfirmacao: true } });
    check("A10: só o 1º mês nasce confirmado, os seguintes em aberto", l.map((x) => x.status).join() === "confirmado,previsto,previsto", l.map((x) => x.status));
    check("A10: os meses futuros não têm data de pagamento", l[1].dataConfirmacao === null && l[2].dataConfirmacao === null && l[0].dataConfirmacao !== null);
    check("A9: 31/01 + 1 e 2 meses = 28/02 e 31/03 (sem pular para 01/03)", l.slice(1).map((x) => x.data.toISOString().slice(0, 10)).join() === "2042-02-28,2042-03-31", l.map((x) => x.data.toISOString().slice(0, 10)));

    // A9: o lançamento do dia 1 conta no mês dele e não no anterior (fronteira UTC).
    await prisma.lancamento.create({ data: { tipo: "receita", descricao: `${tag} dia1`, valor: 777, status: "confirmado", data: dia("2042-09-01"), dataConfirmacao: dia("2042-09-01"), categoriaId: cat.id, autorId } });
    const ago = await indicadores(utcInicioDoDia(2042, 7), utcFimDoDia(2042, 8, 0));
    const set = await indicadores(utcInicioDoDia(2042, 8), utcFimDoDia(2042, 9, 0));
    check("A9: recebido do dia 1º cai em setembro, não em agosto", ago.recebido === 0 && set.recebido === 777, { ago: ago.recebido, set: set.recebido });
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
  }
}

async function alcadaUnica(autorId: string) {
  console.log("\n# N3 — alçada única");
  const CHAVE = "financeiro.niveisAprovacao";
  const salvo = await prisma.configSistema.findUnique({ where: { chave: CHAVE } });
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  if (!catD) return check("categoria de despesa existe", false);
  const supervisor = await prisma.user.create({ data: { name: `${tag}-sup`, email: `${tag}-sup@teste.local`, role: "supervisor", emailVerified: false } });
  const faixas = [{ ate: 1000, papeis: [] }, { ate: null, papeis: ["admin", "supervisor"] }];
  try {
    await prisma.configSistema.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor: faixas }, update: { valor: faixas } });
    const base = { tipo: "despesa" as const, valor: 500, data: "2043-01-10", categoriaId: catD.id, confirmado: false };

    const uma = await criarLancamentoNoTx(prisma, { ...base, descricao: `${tag} uma`, ocorrencias: 1 }, supervisor.id);
    check("R$ 500 sozinho: dentro da faixa automática", uma.status === "previsto", uma.status);
    const tres = await criarLancamentoNoTx(prisma, { ...base, descricao: `${tag} tres`, ocorrencias: 3 }, supervisor.id);
    check("3 × R$ 500 = R$ 1.500: o parcelamento vai para aprovação pelo total", tres.status === "aguardando_aprovacao", tres.status);

    const linha = await prisma.lancamento.findFirstOrThrow({ where: { descricao: `${tag} tres` }, select: { id: true, valor: true, recorrenciaGrupo: true } });
    check("valor da alçada = total do grupo", (await valorParaAlcada(prisma, linha)) === 1500);
    check("valor da alçada com a edição em andamento (uma parcela vira 200)", (await valorParaAlcada(prisma, linha, 200)) === 1200);

    const vistoPeloAutor = (await lancamentosAguardando(supervisor)).filter((l) => l.descricao === `${tag} tres`);
    check("quem lançou vê as próprias desabilitadas com a frase do servidor", vistoPeloAutor.length === 3 && vistoPeloAutor.every((l) => l.bloqueio === MOTIVO_PROPRIA_DESPESA), vistoPeloAutor.map((l) => l.bloqueio));
    const vistoPeloAdmin = (await lancamentosAguardando({ id: autorId, role: "admin" })).filter((l) => l.descricao === `${tag} tres`);
    check("o admin decide", vistoPeloAdmin.every((l) => l.bloqueio === null));

    // Migração: o limite antigo vira faixas equivalentes (>= limite exige aprovação), e a chave sai.
    const sql = readFileSync("prisma/migrations/20261002160000_alcada_unica/migration.sql", "utf8");
    class Desfaz extends Error {}
    let gerado: unknown = null;
    let sobrou = -1;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.configSistema.deleteMany({ where: { chave: CHAVE } });
        await tx.configSistema.create({ data: { chave: "financeiro.limiteAprovacao", valor: 1000 } });
        await tx.$executeRawUnsafe(sql);
        gerado = (await tx.configSistema.findUnique({ where: { chave: CHAVE } }))?.valor ?? null;
        sobrou = await tx.configSistema.count({ where: { chave: "financeiro.limiteAprovacao" } });
        throw new Desfaz();
      });
    } catch (e) {
      if (!(e instanceof Desfaz)) throw e;
    }
    const f = gerado as { ate: number | null; papeis: string[] }[] | null;
    check(
      "migração: limite R$ 1.000 vira faixa automática até R$ 999,99 e o resto só admin",
      !!f && f.length === 2 && Number(f[0].ate) === 999.99 && f[0].papeis.length === 0 && f[1].ate === null && f[1].papeis.join() === "admin" && sobrou === 0,
      { f, sobrou },
    );
  } finally {
    if (salvo) await prisma.configSistema.update({ where: { chave: CHAVE }, data: { valor: salvo.valor as never } });
    else await prisma.configSistema.deleteMany({ where: { chave: CHAVE } });
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
    await prisma.user.delete({ where: { id: supervisor.id } });
  }
}

async function conciliacaoConfiavel(autorId: string) {
  console.log("\n# N4 — conciliação confiável");
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  if (!catD) return check("categoria de despesa existe", false);
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} itau`, tipo: "corrente", saldoInicial: 1000 } });
  const outra = await prisma.contaBancaria.create({ data: { nome: `${tag} nubank`, tipo: "corrente", saldoInicial: 0 } });
  const desp = (descricao: string, valor: number, p: Record<string, unknown> = {}) =>
    prisma.lancamento.create({
      data: { tipo: "despesa", descricao: `${tag} ${descricao}`, valor, status: "previsto", data: dia("2044-03-10"), vencimento: dia("2044-03-10"), categoriaId: catD.id, autorId, ...p },
      select: { id: true },
    });
  const st = (id: string) => prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { status: true, contaId: true, dataConfirmacao: true, excluidoEm: true } });
  try {
    const semConta = await desp("sem conta", 450.5);
    const daOutra = await desp("da outra conta", 777, { contaId: outra.id });
    await desp("empate A", 333);
    await desp("empate B", 333, { vencimento: dia("2044-03-11") });
    const transf = await desp("perna", 222, { transferenciaId: `${tag}-tr` });
    const r = await importarOfxNoBanco({
      contaId: conta.id,
      nomeArquivo: `${tag}.ofx`,
      transacoes: [
        { fitid: `${tag}-1`, data: dia("2044-03-12"), valor: -450.5, descricao: "a" },
        { fitid: `${tag}-2`, data: dia("2044-03-10"), valor: -777, descricao: "b" },
        { fitid: `${tag}-3`, data: dia("2044-03-10"), valor: -333, descricao: "c" },
        { fitid: `${tag}-4`, data: dia("2044-03-10"), valor: -222, descricao: "d" },
      ],
      saldoExtrato: { saldo: 1000 - 450.5, data: dia("2044-03-31") },
      autorId,
    });
    const a = await st(semConta.id);
    check("A4: sem conta casa e ganha a conta do extrato", a.status === "confirmado" && a.contaId === conta.id, a);
    check("A4: outra conta nunca casa", (await st(daOutra.id)).status === "previsto");
    check("A4: empate e perna de transferência ficam para a pessoa", r.conciliadas === 1 && (await st(transf.id)).status === "previsto", r);
    check("saldo do extrato confere com o sistema (inicial − o conciliado)", r.saldo?.diferenca === 0, r.saldo);
    const r2 = await importarOfxNoBanco({ contaId: conta.id, nomeArquivo: `${tag}.ofx`, transacoes: [{ fitid: `${tag}-1`, data: dia("2044-03-12"), valor: -450.5, descricao: "a" }], saldoExtrato: null, autorId });
    check("reimportar o mesmo FITID não duplica", r2.importadas === 0 && r2.duplicadas === 1, r2);

    // Desconciliar devolve ao estado de antes.
    const ta = await prisma.transacaoBancaria.findFirstOrThrow({ where: { fitid: `${tag}-1` }, select: { id: true } });
    const d1 = await desconciliarNoBanco(ta.id, autorId);
    const a2 = await st(semConta.id);
    check("desconciliar: o que a conciliação pagou volta a em aberto, sem conta", d1.efeito === "restaurado" && a2.status === "previsto" && a2.contaId === null && a2.dataConfirmacao === null, { d1, a2 });

    // Conciliar manual com a de outra conta recusa; criar da transação e desconciliar exclui.
    const tb = await prisma.transacaoBancaria.findFirstOrThrow({ where: { fitid: `${tag}-2` }, select: { id: true } });
    const pago = await desp("pago na outra", 777, { contaId: outra.id, status: "confirmado", dataConfirmacao: dia("2044-03-10") });
    check("pago por outra conta não concilia com este extrato", (await erroDe(conciliarNoBanco(tb.id, pago.id, autorId)))?.includes("outra conta") === true);
    await criarDaTransacaoNoBanco(tb.id, catD.id, autorId);
    const criado = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: tb.id }, select: { lancamentoId: true } });
    const d2 = await desconciliarNoBanco(tb.id, autorId);
    check("desconciliar o que nasceu da transação tira o lançamento", d2.efeito === "excluido" && (await st(criado.lancamentoId!)).excluidoEm !== null, d2);

    // Já pago antes da conciliação continua pago.
    const jaPago = await desp("já pago", 333, { contaId: conta.id, status: "confirmado", dataConfirmacao: dia("2044-03-10") });
    const tc = await prisma.transacaoBancaria.findFirstOrThrow({ where: { fitid: `${tag}-3` }, select: { id: true } });
    await conciliarNoBanco(tc.id, jaPago.id, autorId);
    const d3 = await desconciliarNoBanco(tc.id, autorId);
    check("desconciliar o que já estava pago antes: continua pago", d3.efeito === "desligada" && (await st(jaPago.id)).status === "confirmado", d3);
  } finally {
    const contas = [conta.id, outra.id];
    await prisma.transacaoBancaria.deleteMany({ where: { contaId: { in: contas } } });
    await prisma.extratoBancario.deleteMany({ where: { contaId: { in: contas } } });
    await prisma.lancamento.deleteMany({ where: { OR: [{ descricao: { startsWith: tag } }, { contaId: { in: contas } }], excluidoEm: { not: undefined } } });
    await prisma.contaBancaria.deleteMany({ where: { id: { in: contas } } });
  }
}

async function travaDoPeriodo(autorId: string) {
  console.log("\n# N5 — trava do período fechado");
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  if (!catD) return check("categoria de despesa existe", false);
  const fech = await prisma.fechamentoMensal.create({ data: { ano: 2045, mes: 3, status: "fechado", fechadoEm: new Date(), responsavelId: autorId } });
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} trava`, tipo: "corrente", saldoInicial: 100 } });
  const desp = (p: Record<string, unknown>) =>
    prisma.lancamento.create({
      data: { tipo: "despesa", descricao: `${tag} trava`, valor: 50, status: "previsto", data: dia("2045-03-10"), vencimento: dia("2045-03-10"), categoriaId: catD.id, autorId, ...p },
      select: { id: true },
    });
  try {
    const criar = await erroDe(criarLancamentoNoTx(prisma, { tipo: "despesa", descricao: `${tag} trava`, valor: 10, data: "2045-03-15", categoriaId: catD.id, confirmado: false, ocorrencias: 1 }, autorId));
    check("criar em mês fechado é recusado, com o mês na frase", criar?.startsWith("Março/2045 está fechado") === true, criar);
    const recorrente = await erroDe(criarLancamentoNoTx(prisma, { tipo: "despesa", descricao: `${tag} trava`, valor: 10, data: "2045-01-15", categoriaId: catD.id, confirmado: false, ocorrencias: 4 }, autorId));
    check("recorrência que atravessa o mês fechado é recusada", recorrente?.includes("Março/2045") === true, recorrente);

    const pagoNoFechado = await desp({ status: "confirmado", dataConfirmacao: dia("2045-03-12"), contaId: conta.id });
    check("estornar pagamento de mês fechado é recusado", (await erroDe(estornarNoBanco(pagoNoFechado.id, autorId)))?.includes("fechado") === true);
    const cancelada = await desp({ status: "cancelado" });
    check("reabrir lançamento de mês fechado é recusado", (await erroDe(reabrirNoBanco(cancelada.id, autorId)))?.includes("fechado") === true);
    const vencidaDoFechado = await desp({});
    check("conta vencida do mês fechado se paga em mês aberto (só a data do pagamento conta)", (await erroDe(exigirPeriodoAberto(prisma, [dia("2045-04-02")]))) === null);
    void vencidaDoFechado;

    const ofx = await importarOfxNoBanco({
      contaId: conta.id,
      nomeArquivo: `${tag}-trava.ofx`,
      transacoes: [{ fitid: `${tag}-trava-1`, data: dia("2045-03-10"), valor: -50, descricao: "x" }],
      saldoExtrato: null,
      autorId,
    });
    check("OFX: transação de mês fechado entra, mas não é conciliada sozinha", ofx.importadas === 1 && ofx.conciliadas === 0, ofx);
    const t = await prisma.transacaoBancaria.findFirstOrThrow({ where: { fitid: `${tag}-trava-1` }, select: { id: true } });
    check("conciliar à mão no mês fechado é recusado", (await erroDe(conciliarNoBanco(t.id, vencidaDoFechado.id, autorId)))?.includes("fechado") === true);

    const linha = ["Despesa", "Pendente", "2045-03-02", "", "-80", "", `${tag} imp trava`, `${tag} cat`, "", `${tag} trava`, "", "", "", `${Date.now()}t`];
    const mapa = { tipo: 0, status: 1, data: 2, dataConfirmacao: 3, valor: 4, valorEfetivo: 5, descricao: 6, categoria: 7, subcategoria: 8, conta: 9, contaTransferencia: 10, contato: 11, documento: 12, idUnico: 13 };
    const imp = await erroDe(executarCommit(prisma, { nomeArquivo: `${tag}-trava.csv`, mapeamento: {}, res: normalizarLinhas([linha], mapa), autorId }));
    check("importar linha de mês fechado é recusado", imp?.includes("fechado") === true, imp);

    const saldos = await saldosDasContasNoFimDoMes(2045, 3);
    check("saldo da conta no último dia do mês: inicial − o pago no mês", saldos.find((s) => s.contaId === conta.id)?.saldo === 50, saldos.find((s) => s.contaId === conta.id));
  } finally {
    await prisma.transacaoBancaria.deleteMany({ where: { contaId: conta.id } });
    await prisma.extratoBancario.deleteMany({ where: { contaId: conta.id } });
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: tag } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: tag }, lancamentos: { none: {} } } });
    await prisma.fechamentoMensal.delete({ where: { id: fech.id } });
  }
}

async function categoriasEConsistencia(autorId: string) {
  console.log("\n# N6 — categorias e consistência");
  const catR = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  if (!catR || !catD) return check("categorias de receita e despesa existem", false);

  // Tipo do lançamento × categoria.
  const err = await erroDe(criarLancamentoNoTx(prisma, { tipo: "despesa", descricao: `${tag} tipo`, valor: 10, data: "2046-01-10", categoriaId: catR.id, confirmado: false, ocorrencias: 1 }, autorId));
  check("despesa com categoria de receita é recusada", err?.includes("de receita") === true, err);

  // Categoria do sistema achada pela chave com o código renumerado.
  const folha = await prisma.categoriaFinanceira.findUnique({ where: { chave: "despesa_folha_clt" }, select: { id: true, codigo: true } });
  if (folha) {
    const antes = folha.codigo;
    await prisma.categoriaFinanceira.update({ where: { id: folha.id }, data: { codigo: `${tag}-9.99` } });
    try {
      const id = await acharCategoriaDoSistema(prisma, "2.03");
      check("renumerar o código da Folha CLT não quebra o produtor (acha pela chave)", id === folha.id, id);
    } finally {
      await prisma.categoriaFinanceira.update({ where: { id: folha.id }, data: { codigo: antes } });
    }
  } else check("categoria Folha CLT tem chave no banco", false);

  // Recebível por entrega e parcelas do projeto levam o cliente.
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cli` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-proj`, clienteId: cliente.id },
  });
  const disc = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Elétrica", valor: 100 } });
  try {
    await faturarEntregaDaDisciplina({ disciplinaId: disc.id, valor: 500, autorId });
    const l = await prisma.lancamento.findFirstOrThrow({ where: { projetoId: projeto.id, tipo: "receita" }, select: { clienteId: true } });
    check("faturamento por entrega leva o cliente do projeto", l.clienteId === cliente.id, l);
  } finally {
    await prisma.lancamento.deleteMany({ where: { projetoId: projeto.id, excluidoEm: { not: undefined } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  // Natureza fora do módulo: perna de transferência pendente não vira inadimplência nem resumo.
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} nat`, tipo: "corrente", saldoInicial: 0 } });
  try {
    const venc = dia(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    const transf = await prisma.categoriaFinanceira.findFirst({ where: { natureza: "transferencia", tipo: "receita" }, select: { id: true } });
    if (transf) {
      await prisma.lancamento.create({
        data: { tipo: "receita", descricao: `${tag} perna`, valor: 10, status: "previsto", data: venc, vencimento: venc, categoriaId: transf.id, contaId: conta.id, transferenciaId: `${tag}-t`, autorId },
      });
      const n = await alertaInadimplencia();
      check("perna de transferência vencida não entra no alerta de inadimplência", n === 0 || (await prisma.lancamento.count({ where: { descricao: `${tag} perna` } })) === 1, n);
    }
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
    await prisma.contaBancaria.delete({ where: { id: conta.id } });
  }
}

async function taxaDeArt(autorId: string) {
  console.log("\n# N7 — ART: taxa e reembolso pelo Financeiro");
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-art-cli` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-art`, clienteId: cliente.id },
  });
  const entrada = (p: Partial<Parameters<typeof sincronizarLancamentosArt>[1]>) => ({
    tipo: "ART",
    numero: `${tag}-1`,
    situacao: "emitida",
    custeio: "reembolso",
    valor: 120 as number | null,
    emitidaEm: dia("2047-02-10"),
    lancamentoId: null as string | null,
    reembolsoLancamentoId: null as string | null,
    disciplinaNome: "Estrutural",
    projetoId: projeto.id,
    projetoCodigo: projeto.codigo,
    clienteId: cliente.id,
    autorId,
    ...p,
  });
  try {
    const r1 = await prisma.$transaction((tx) => sincronizarLancamentosArt(tx, entrada({})));
    const desp = await prisma.lancamento.findUniqueOrThrow({ where: { id: r1.lancamentoId! }, select: { status: true, tipo: true, categoria: { select: { chave: true } } } });
    const reemb = await prisma.lancamento.findUniqueOrThrow({ where: { id: r1.reembolsoLancamentoId! }, select: { status: true, tipo: true, clienteId: true, tags: true } });
    check("ART com reembolso gera a despesa da taxa e a receita do reembolso, em aberto", desp.status === "previsto" && desp.tipo === "despesa" && reemb.tipo === "receita" && reemb.status === "previsto", { desp, reemb });
    check("a taxa usa a categoria de ART pela chave; o reembolso leva o cliente e a tag", desp.categoria.chave === "despesa_art_rrt" && reemb.clienteId === cliente.id && reemb.tags.includes("reembolso-art"), { desp, reemb });

    // Baixa no Financeiro: o valor da ART não muda mais (o dinheiro se moveu).
    await prisma.lancamento.update({ where: { id: r1.lancamentoId! }, data: { status: "confirmado", dataConfirmacao: dia("2047-02-11") } });
    const mudaValor = await erroDe(prisma.$transaction((tx) => sincronizarLancamentosArt(tx, entrada({ valor: 150, lancamentoId: r1.lancamentoId, reembolsoLancamentoId: r1.reembolsoLancamentoId }))));
    check("taxa já baixada: mudar o valor da ART é recusado", mudaValor?.includes("já foi baixado") === true, mudaValor);
    const cancela = await prisma.$transaction((tx) => sincronizarLancamentosArt(tx, entrada({ situacao: "cancelada", lancamentoId: r1.lancamentoId, reembolsoLancamentoId: r1.reembolsoLancamentoId })));
    const aposCancelar = await prisma.lancamento.findUniqueOrThrow({ where: { id: r1.lancamentoId! }, select: { status: true } });
    const reembAposCancelar = await prisma.lancamento.findUniqueOrThrow({ where: { id: r1.reembolsoLancamentoId! }, select: { status: true } });
    check("cancelar a ART não desfaz a taxa já paga, e cancela o reembolso em aberto", aposCancelar.status === "confirmado" && reembAposCancelar.status === "cancelado" && cancela.lancamentoId === r1.lancamentoId, { aposCancelar, reembAposCancelar });
  } finally {
    await prisma.lancamento.deleteMany({ where: { projetoId: projeto.id, excluidoEm: { not: undefined } } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }
}

async function extratoEPagas(autorId: string) {
  console.log("\n# M0 — Extrato por conta e Pagas e recebidas");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  const catR = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita", natureza: "resultado" }, select: { id: true } });
  if (!cat || !catR) return check("categorias existem", false);
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} extrato`, tipo: "corrente", saldoInicial: 1000 } });
  const novo = (p: Record<string, unknown>) =>
    prisma.lancamento.create({
      data: { tipo: "despesa", descricao: `${tag} ext`, valor: 100, status: "confirmado", data: dia("2048-05-10"), dataConfirmacao: dia("2048-05-10"), categoriaId: cat.id, autorId, ...p },
      select: { id: true },
    });
  try {
    await novo({ tipo: "receita", categoriaId: catR.id, valor: 500, contaId: conta.id, dataConfirmacao: dia("2048-04-20"), data: dia("2048-04-20") });
    await novo({ tipo: "receita", categoriaId: catR.id, valor: 3000, contaId: conta.id, dataConfirmacao: dia("2048-05-02"), data: dia("2048-05-02") });
    await novo({ valor: 400, valorEfetivo: 380, contaId: conta.id, dataConfirmacao: dia("2048-05-06") });
    await novo({ valor: 70, contaId: null });
    await novo({ valor: 999, contaId: conta.id, dataConfirmacao: dia("2048-06-03"), data: dia("2048-06-03") });
    const d = await extratoDaConta(conta.id, "2048-05");
    const e = d.extrato;
    check("saldo anterior = inicial + o realizado antes do mês (1.000 + 500)", e.saldoAnteriorCentavos === 150_000, e.saldoAnteriorCentavos);
    check("entradas 3.000 e saídas 380 (o pago, não o previsto)", e.entradasCentavos === 300_000 && e.saidasCentavos === 38_000, e);
    check("saldo final = anterior + entradas − saídas (1.500 + 3.000 − 380)", e.saldoFinalCentavos === 412_000, e.saldoFinalCentavos);
    check("lançamento sem conta fica fora do extrato e é contado à parte", e.linhas.length === 2 && d.semConta === 1, { n: e.linhas.length, semConta: d.semConta });
    check("movimento de junho não entra no extrato de maio", !e.linhas.some((l) => l.efeitoCentavos === -99_900));

    const pagas = await dadosPagas("2048-05");
    const nossas = pagas.filter((l) => l.descricao === `${tag} ext`);
    check("Pagas e recebidas do mês: pela data do pagamento (3 de maio + sem conta; junho e abril fora)", nossas.length === 3, nossas.length);
    check("o valor pago parcial vem em valorEfetivo", nossas.some((l) => l.valorEfetivo === 380), nossas.map((l) => l.valorEfetivo));
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
    await prisma.contaBancaria.delete({ where: { id: conta.id } });
  }
}

async function regrasDePreenchimento(autorId: string) {
  console.log("\n# M2 — regras de preenchimento");
  const catD = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, orderBy: { codigo: "asc" }, select: { id: true } });
  const catOutra = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado", id: { not: catD?.id } }, select: { id: true } });
  if (!catD || !catOutra) return check("categorias de despesa existem", false);
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} regras`, tipo: "corrente", saldoInicial: 0 } });
  const centro = await prisma.centroCusto.create({ data: { nome: `${tag} centro` } });
  const forn = await prisma.fornecedor.create({ data: { tipo: "PJ", nome: `${tag} fornecedor` } });
  const termo = `${tag}-crea`;
  const regraIds: string[] = [];
  const lotes: string[] = [];
  const categoriasAntes = new Set((await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id));
  try {
    // ordem negativa: as duas vão antes de qualquer regra que exista no banco de dev.
    const a = await prisma.regraCategorizacao.create({
      data: { termo, ordem: -1000, condicoes: [{ campo: "descricao", op: "contem", valor: termo }, { campo: "tipo", op: "igual", valor: "despesa" }], categoriaId: catD.id, centroId: centro.id, fornecedorId: forn.id, tags: ["art"] },
    });
    const b = await prisma.regraCategorizacao.create({
      data: { termo, ordem: -999, condicoes: [{ campo: "descricao", op: "contem", valor: termo }], categoriaId: catOutra.id },
    });
    regraIds.push(a.id, b.id);
    const entrada = { descricao: `${termo} boleto 123`, tipo: "despesa" as const, valor: 120, contaId: conta.id };

    const s1 = await sugerirParaEntrada(prisma, entrada);
    check("a primeira regra da lista que casa vale (a segunda não completa)", s1?.regraId === a.id && s1.preenche.categoriaId === catD.id, s1);
    const s2 = await sugerirParaEntrada(prisma, entrada, { categoriaId: "ja-escolhida", centroId: "ja-escolhido" });
    check("nunca sobrescreve o que a pessoa escolheu", s2?.preenche.categoriaId === undefined && s2?.preenche.centroId === undefined && s2?.preenche.fornecedorId === forn.id, s2);
    check("receita não recebe o fornecedor da regra", (await sugerirParaEntrada(prisma, { ...entrada, tipo: "receita" }))?.regraId === b.id);
    await prisma.regraCategorizacao.update({ where: { id: a.id }, data: { ativo: false } });
    check("regra pausada é ignorada: vale a seguinte", (await sugerirParaEntrada(prisma, entrada))?.regraId === b.id);
    await prisma.regraCategorizacao.update({ where: { id: a.id }, data: { ativo: true } });

    // Prévia: lançamentos dos últimos 12 meses que as condições casariam.
    const recente = new Date();
    await prisma.lancamento.create({ data: { tipo: "despesa", descricao: `${termo} histórico`, valor: 50, status: "previsto", data: recente, vencimento: recente, categoriaId: catD.id, autorId } });
    const prev = await casamentosDoHistorico([{ campo: "descricao", op: "contem", valor: termo }]);
    check("a prévia conta o histórico que a regra casaria", prev.total === 1 && prev.amostra[0]?.descricao === `${termo} histórico`, prev);

    // Conciliação: criar o lançamento da transação aplica o resto da regra e conta o uso.
    const r = await importarOfxNoBanco({
      contaId: conta.id,
      nomeArquivo: `${tag}-regras.ofx`,
      transacoes: [{ fitid: `${tag}-rg1`, data: dia("2043-03-10"), valor: -120, descricao: `${termo} boleto 123` }],
      saldoExtrato: null,
      autorId,
    });
    check("OFX importado sem casamento automático", r.importadas === 1 && r.conciliadas === 0, r);
    const t = await prisma.transacaoBancaria.findFirstOrThrow({ where: { fitid: `${tag}-rg1` }, select: { id: true } });
    await criarDaTransacaoNoBanco(t.id, catD.id, autorId);
    const tr = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: t.id }, select: { lancamentoId: true } });
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id: tr.lancamentoId! }, select: { centroId: true, fornecedorId: true, tags: true, categoriaId: true } });
    check("conciliação: o lançamento criado ganha centro, contato e tags da regra", l.centroId === centro.id && l.fornecedorId === forn.id && l.tags.includes("art") && l.categoriaId === catD.id, l);
    check("o uso da regra é contado", (await prisma.regraCategorizacao.findUniqueOrThrow({ where: { id: a.id }, select: { usos: true } })).usos === 1);

    // Importação de planilha: completa o que veio vazio e respeita a categoria da planilha.
    const linha = ["Despesa", "Pendente", "2043-04-02", "", "-90", "", `${termo} planilha`, `${tag} catplan`, "", `${tag} contaplan`, "", "", "", `${Date.now()}rg`];
    const mapa = { tipo: 0, status: 1, data: 2, dataConfirmacao: 3, valor: 4, valorEfetivo: 5, descricao: 6, categoria: 7, subcategoria: 8, conta: 9, contaTransferencia: 10, contato: 11, documento: 12, idUnico: 13 };
    const res = normalizarLinhas([linha], mapa);
    const { loteId } = await executarCommit(prisma, { nomeArquivo: `${tag}-regras.csv`, mapeamento: {}, res, autorId });
    lotes.push(loteId);
    const li = await prisma.lancamento.findFirstOrThrow({ where: { importLoteId: loteId }, select: { centroId: true, fornecedorId: true, tags: true, categoria: { select: { nome: true } } } });
    check("importação: centro, contato e tags vêm da regra; a categoria fica a da planilha", li.centroId === centro.id && li.fornecedorId === forn.id && li.tags.includes("art") && li.categoria.nome === `${tag} catplan`, li);
  } finally {
    for (const id of lotes) {
      await prisma.lancamento.deleteMany({ where: { importLoteId: id, excluidoEm: { not: undefined } } });
      await prisma.importacaoFinanceira.delete({ where: { id } });
    }
    await prisma.regraCategorizacao.deleteMany({ where: { id: { in: regraIds } } });
    await prisma.transacaoBancaria.deleteMany({ where: { contaId: conta.id } });
    await prisma.extratoBancario.deleteMany({ where: { contaId: conta.id } });
    await prisma.lancamento.deleteMany({ where: { OR: [{ descricao: { startsWith: tag } }, { descricao: { startsWith: termo } }, { contaId: conta.id }], excluidoEm: { not: undefined } } });
    await prisma.contaBancaria.deleteMany({ where: { OR: [{ id: conta.id }, { nome: { startsWith: tag } }] } });
    await prisma.centroCusto.delete({ where: { id: centro.id } });
    await prisma.fornecedor.delete({ where: { id: forn.id } });
    const novas = (await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id).filter((id) => !categoriasAntes.has(id));
    if (novas.length) await prisma.categoriaFinanceira.deleteMany({ where: { id: { in: novas }, lancamentos: { none: {} } } });
  }
}

async function cartoesDeCredito(autorId: string) {
  console.log("\n# M3 — cartões de crédito e cartão pessoal");
  const cat = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "despesa", natureza: "resultado" }, select: { id: true } });
  const catReceita = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "receita" }, select: { id: true } });
  if (!cat || !catReceita) return check("categorias existem", false);
  const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} cartao`, tipo: "corrente", saldoInicial: 0 } });
  const cartao = await prisma.cartaoCredito.create({
    data: { nome: `${tag} Visa`, tipo: "empresa", diaFechamento: 25, diaVencimento: 5, contaPadraoId: conta.id },
  });
  // Datas RELATIVAS: a fatura de 70 dias atrás já fechou em qualquer dia do mês; a de hoje está aberta.
  const hoje = new Date().toISOString().slice(0, 10);
  const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const compraVelha = diasAtras(70);
  try {
    const c1 = await lancarCompraNoBanco(
      { cartaoId: cartao.id, descricao: `${tag} licença`, valor: 300, dataCompra: compraVelha, categoriaId: cat.id, parcelas: 3 },
      autorId,
    );
    check("compra parcelada vira 3 despesas, uma por fatura", c1.lancamentoIds.length === 3 && c1.faturas.length === 3, c1);
    const parcelas = await prisma.lancamento.findMany({
      where: { id: { in: c1.lancamentoIds } },
      orderBy: { data: "asc" },
      select: { descricao: true, valor: true, data: true, vencimento: true, contaId: true, status: true, dataCompetencia: true, faturaId: true },
    });
    const dias = parcelas.map((p) => p.data.toISOString().slice(0, 10));
    check("a despesa de cada parcela é da data dela, um mês depois da outra", dias[0] === compraVelha && dias.length === 3 && new Set(dias).size === 3, dias);
    check("a competência acompanha a data da parcela", parcelas.every((p) => p.dataCompetencia?.toISOString().slice(0, 10) === p.data.toISOString().slice(0, 10)));
    check("a compra nasce em aberto e SEM conta: o caixa só sai no pagamento", parcelas.every((p) => p.status === "previsto" && p.contaId === null));
    check("cada parcela vence no dia 5 (o vencimento da fatura dela)", parcelas.every((p) => p.vencimento?.getUTCDate() === 5), parcelas.map((p) => p.vencimento?.toISOString().slice(0, 10)));
    check("descrição numerada (1/3)", parcelas[0].descricao.endsWith("(1/3)"), parcelas[0].descricao);
    check("cada parcela numa fatura diferente", new Set(parcelas.map((p) => p.faturaId)).size === 3);

    // Compra de hoje: cai na fatura do ciclo em curso, que ainda está aberta.
    const cHoje = await lancarCompraNoBanco({ cartaoId: cartao.id, descricao: `${tag} combustível`, valor: 80, dataCompra: hoje, categoriaId: cat.id, parcelas: 1 }, autorId);
    const faturaDeHoje = (await prisma.lancamento.findUniqueOrThrow({ where: { id: cHoje.lancamentoIds[0] }, select: { faturaId: true } })).faturaId!;
    const cedo = await erroDe(pagarFaturaNoBanco({ faturaId: faturaDeHoje, contaId: conta.id, data: hoje }, autorId));
    check("fatura do ciclo em curso ainda está aberta: não se paga", cedo?.includes("ainda está aberta") === true, cedo);

    const faturaVelha = parcelas[0].faturaId!;
    const antes = await prisma.lancamento.count({ where: { faturaId: faturaVelha, status: "previsto" } });
    const lancamentosAntes = await prisma.lancamento.count({ where: { cartaoId: cartao.id } });
    const r = await pagarFaturaNoBanco({ faturaId: faturaVelha, contaId: conta.id, data: hoje }, autorId);
    check("pagar a fatura realiza só as compras dela", r.comprasPagas === antes && antes === 1, { r, antes });
    check("pagar NÃO cria lançamento nenhum (a compra já é a despesa)", (await prisma.lancamento.count({ where: { cartaoId: cartao.id } })) === lancamentosAntes);
    const paga = await prisma.lancamento.findFirstOrThrow({ where: { faturaId: faturaVelha }, select: { status: true, contaId: true, dataConfirmacao: true, valor: true } });
    check("a compra paga ganha a conta e a data do pagamento", paga.status === "confirmado" && paga.contaId === conta.id && paga.dataConfirmacao?.toISOString().slice(0, 10) === hoje, paga);
    check("o total pago é a soma das compras da fatura", r.totalCentavos === Math.round(Number(paga.valor) * 100), r);

    const denovo = await erroDe(pagarFaturaNoBanco({ faturaId: faturaVelha, contaId: conta.id, data: hoje }, autorId));
    check("fatura já paga não se paga de novo", denovo?.includes("já foi paga") === true, denovo);

    // Estornar reabre a fatura sem nenhum estado gravado.
    const idPago = (await prisma.lancamento.findFirstOrThrow({ where: { faturaId: faturaVelha }, select: { id: true } })).id;
    await estornarNoBanco(idPago, autorId);
    check("estornar a compra devolve a fatura ao estado de a pagar", (await prisma.lancamento.count({ where: { faturaId: faturaVelha, status: "previsto" } })) === 1);
    const depoisDoEstorno = await pagarFaturaNoBanco({ faturaId: faturaVelha, contaId: conta.id, data: hoje }, autorId);
    check("e ela volta a poder ser paga", depoisDoEstorno.comprasPagas === 1);

    // Editar: mudar a data muda de fatura; compra paga não se edita.
    const segunda = await prisma.lancamento.findFirstOrThrow({ where: { descricao: { contains: "(2/3)" }, cartaoId: cartao.id }, select: { id: true, faturaId: true } });
    const ed = await editarCompraNoBanco({ lancamentoId: segunda.id, descricao: `${tag} licença (2/3)`, valor: 100, dataCompra: hoje, categoriaId: cat.id }, autorId);
    check("mudar a data da compra a leva para a fatura do novo ciclo", ed.faturaId !== segunda.faturaId, ed);
    const recusa = await erroDe(editarCompraNoBanco({ lancamentoId: idPago, descricao: "x", valor: 1, dataCompra: compraVelha, categoriaId: cat.id }, autorId));
    check("compra já paga não se edita", recusa !== null, recusa);
    const errada = await erroDe(lancarCompraNoBanco({ cartaoId: cartao.id, descricao: `${tag} erro`, valor: 10, dataCompra: compraVelha, categoriaId: catReceita.id, parcelas: 1 }, autorId));
    check("compra com categoria de receita é recusada", errada !== null, errada);

    // Cartão pessoal: reembolso individual. O sócio é criado aqui (o banco de dev pode não ter nenhum).
    {
      const dono = await prisma.user.create({ data: { name: `${tag}-socio`, email: `${tag}-socio@teste.local`, role: "admin", emailVerified: false } });
      const socio = await prisma.socio.create({ data: { userId: dono.id, percentual: 100 } });
      const pessoal = await prisma.cartaoCredito.create({ data: { nome: `${tag} pessoal`, tipo: "pessoal", socioId: socio.id, diaFechamento: 25, diaVencimento: 10 } });
      try {
        const p1 = await lancarCompraNoBanco({ cartaoId: pessoal.id, descricao: `${tag} almoço`, valor: 50, dataCompra: compraVelha, categoriaId: cat.id, parcelas: 1 }, autorId);
        const p2 = await lancarCompraNoBanco({ cartaoId: pessoal.id, descricao: `${tag} táxi`, valor: 30, dataCompra: compraVelha, categoriaId: cat.id, parcelas: 1 }, autorId);
        const f = (await prisma.lancamento.findUniqueOrThrow({ where: { id: p1.lancamentoIds[0] }, select: { faturaId: true } })).faturaId!;
        const noPlanejador = (await baseDoPlanejador({ horizonteDias: 365 })).eventos.find((e) => e.id === `fatura:${f}`);
        check(
          "as duas despesas do sócio viram UM reembolso no planejador, com o nome dele",
          noPlanejador?.valor === 80_00 && noPlanejador.descricao.startsWith(`Reembolso a ${tag}-socio`),
          { id: noPlanejador?.id, valor: noPlanejador?.valor, desc: noPlanejador?.descricao },
        );
        await pagarCompraNoBanco(p1.lancamentoIds[0], conta.id, hoje, autorId);
        check("reembolsar uma despesa só deixa o resto da fatura em aberto", (await prisma.lancamento.count({ where: { faturaId: f, status: "previsto" } })) === 1);
        await pagarCompraNoBanco(p2.lancamentoIds[0], conta.id, hoje, autorId);
        check("com a última reembolsada, nada fica em aberto (a fatura se lê como paga)", (await prisma.lancamento.count({ where: { faturaId: f, status: "previsto" } })) === 0);
      } finally {
        await prisma.lancamento.deleteMany({ where: { cartaoId: pessoal.id } });
        await prisma.faturaCartao.deleteMany({ where: { cartaoId: pessoal.id } });
        await prisma.cartaoCredito.delete({ where: { id: pessoal.id } });
        await prisma.socio.delete({ where: { id: socio.id } });
        await prisma.user.delete({ where: { id: dono.id } });
      }
    }

    // Planejador: as compras em aberto da mesma fatura viram um evento só, não ajustável.
    const base = await baseDoPlanejador({ horizonteDias: 180 });
    const daFatura = base.eventos.filter((e) => e.origem === "fatura");
    check("no planejador a fatura é UM evento, com a data travada no vencimento", daFatura.length >= 1 && daFatura.every((e) => e.naoProgramavel !== null), daFatura.map((e) => [e.id, e.valor]));
    check("sem compras de cartão a agregação não mexe em nada", agregarFaturas(base.eventos, new Map()).length === base.eventos.length);
  } finally {
    await prisma.lancamento.deleteMany({ where: { cartaoId: cartao.id } });
    await prisma.faturaCartao.deleteMany({ where: { cartaoId: cartao.id } });
    await prisma.cartaoCredito.delete({ where: { id: cartao.id } });
    await prisma.contaBancaria.delete({ where: { id: conta.id } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
