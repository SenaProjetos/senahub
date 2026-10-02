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
} from "../src/modules/financeiro/custo/lancamento-custo";
import { liberarPagamentosProjetista, sincronizarPagamentosDisciplina } from "../src/modules/uploads/pagamento";
import { indicadores } from "../src/modules/financeiro/relatorios/queries";
import { estornarNoBanco, exigirOperacao, reabrirNoBanco } from "../src/modules/financeiro/lancamentos/situacao-service";
import { executarCommit, executarDesfazer } from "../src/modules/financeiro/importacao/commit-core";
import { criarLancamentoNoTx } from "../src/modules/financeiro/lancamentos/service";
import { utcFimDoDia, utcInicioDoDia } from "../src/lib/data";
import { lancamentosAguardando, valorParaAlcada } from "../src/modules/financeiro/aprovacao/queries";
import { MOTIVO_PROPRIA_DESPESA } from "../src/modules/financeiro/aprovacao/niveis";
import { hashesExistentes } from "../src/modules/financeiro/importacao/queries";
import { normalizarLinhas } from "../src/modules/financeiro/importacao/processar";

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

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
