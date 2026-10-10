/**
 * Smoke do planejador de caixa (F0) contra o banco de dev. O vitest cobre o motor puro
 * (`src/modules/financeiro/liquidez/*.test.ts`); aqui vão os três pilares no banco de verdade:
 *
 * 1. Caixa atual (S0) da base do planejador = `fluxoCaixa().saldoTotal` da Visão geral, antes e
 *    depois de criar dados.
 * 2. Só pendente vivo vira evento: realizado, cancelado e excluído ficam de fora; prioridade
 *    herdada da categoria, confiança gravada, pernas de transferência pareadas e sem par.
 * 3. Ler a base e projetar não grava nada; o resto de um parcial herda os campos do planejador.
 * Extra: transferência importada do Meu Dinheiro nasce com natureza `transferencia` e as duas
 * pernas pareadas por `transferenciaId` (a migração só corrigiu o que já existia).
 * F3 (spec §7): aplicar ao financeiro é tudo ou nada — ajuste obsoleto barra tudo; falha de regra no
 * 3º item (campo obrigatório) e corrida entre validar e gravar desfazem os dois primeiros no banco
 * de verdade; o caminho feliz grava, audita e marca o cenário.
 * F4 (spec §4, plano I9): caixinha com uso CALCULADO (alocado − realizado ligado, só depois da criação),
 * o livre não cai duas vezes quando a caixinha paga, troca de caixinha atômica e arquivada recusada.
 * F5: distribuição de recebimento — rateio exato (centavo no último), a parte livre não move nada,
 * duas confirmações simultâneas reservam uma vez só, e fora da fila ficam reembolso, transferência,
 * anterior à data inicial e o que ainda está em aberto.
 * F6A: compromisso recorrente — mês sem lançamento é projetado, geração idempotente (duas execuções
 * simultâneas criam o mês uma vez), mês gerado deixa de ser projetado, e o vínculo manual tira o mês
 * da projeção com o valor do lançamento valendo.
 * F6C (spec §8): pró-labore é despesa da DRE; distribuição de lucros sai do caixa e do DFC mas NÃO da
 * DRE; transferência fica fora dos dois e fora do aging e do balanço.
 * F6B: distribuição de lucros dividida pelo percentual de cada sócio, em contas a pagar fora do
 * resultado — e recusada quando os percentuais não fecham 100%.
 * N0 (núcleo do Financeiro): fechar a folha CLT define o valor da conta da competência e NÃO paga;
 * a folha de M vence no 5º dia útil de M+1 (com feriado), o adiantamento de salário fica à parte, folha
 * já paga não ganha outra conta, reabrir não apaga nada e é recusado depois de pago, e o 13º é outro.
 *
 * Uso: npm run smoke:planejador
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inicioDoDiaUtc } from "../src/lib/data";
import { fluxoCaixa } from "../src/modules/financeiro/caixa/queries";
import { baseDoPlanejador } from "../src/modules/financeiro/liquidez/queries";
import { projetar } from "../src/modules/financeiro/liquidez/motor";
import { somarDias } from "../src/modules/financeiro/liquidez/datas";
import { paraCentavos } from "../src/modules/financeiro/liquidez/dinheiro";
import { camposDoPlanejador } from "../src/modules/financeiro/lancamentos/parcial";
import type { Prisma } from "../src/generated/prisma/client";
import { normalizarLinhas } from "../src/modules/financeiro/importacao/processar";
import { executarCommit, executarDesfazer } from "../src/modules/financeiro/importacao/commit-core";
import { alvosAtuais } from "../src/modules/financeiro/liquidez/queries";
import { CHAVE_CONFIG_FINANCEIRO } from "../src/modules/financeiro/config/queries";
import { validarAplicacao } from "../src/modules/financeiro/liquidez/aplicacao";
import type { AjusteSimulado } from "../src/modules/financeiro/liquidez/ajustes";
import type { Observado } from "../src/modules/financeiro/liquidez/tipos";
import { aplicarAjustesAoFinanceiro, gravarPlano } from "../src/modules/financeiro/planejador/cenarios/service";
import { carregarCaixinhas } from "../src/modules/financeiro/caixinhas/queries";
import { movimentarNoBanco } from "../src/modules/financeiro/caixinhas/service";
import { criarLancamentoNoTx } from "../src/modules/financeiro/lancamentos/service";
import { CHAVE_CONFIG_LIQUIDEZ } from "../src/modules/financeiro/config/liquidez";
import { recebimentosADistribuir } from "../src/modules/financeiro/distribuicao/queries";
import { distribuirRecebimento, gravarRegra, pularRecebimento } from "../src/modules/financeiro/distribuicao/service";
import { competenciaDe, idDoProgramado, rotuloDaCompetencia, vencimentoDa } from "../src/modules/financeiro/recorrencia/calculo";
import { gerarLancamentosRecorrentes, vincularLancamento } from "../src/modules/financeiro/recorrencia/service";
import { agingReport } from "../src/modules/financeiro/aging/queries";
import { balancoGerencial, indicadores, relatorioDFC, relatorioDRE } from "../src/modules/financeiro/relatorios/queries";
import { motivoDoRateio, percentualParaBp, ratearEntreSocios } from "../src/modules/financeiro/socios/calculo";
import { fecharFolhaNoBanco, reabrirFolhaNoBanco } from "../src/modules/rh/folha/fechamento-service";


let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-planejador-${Date.now()}`;
const hoje = inicioDoDiaUtc().toISOString().slice(0, 10);
const em = (n: number) => new Date(`${somarDias(hoje, n)}T00:00:00.000Z`);

async function retrato() {
  const n = await prisma.lancamento.count({ where: { excluidoEm: { not: undefined } } });
  const ultimo = await prisma.lancamento.aggregate({ _max: { updatedAt: true }, where: { excluidoEm: { not: undefined } } });
  return `${n}|${ultimo._max.updatedAt?.toISOString() ?? "-"}`;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const [catReceita, catFornecedor, catFolha] = await Promise.all(
    ["receita_projetos_particulares", "despesa_fornecedores", "despesa_folha_clt"].map((chave) =>
      prisma.categoriaFinanceira.findUnique({ where: { chave }, select: { id: true, prioridadePadrao: true } }),
    ),
  );
  if (!catReceita || !catFornecedor || !catFolha) {
    console.log("Plano de contas sem as chaves da semente — rode as migrações e `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }

  console.log("\n# Migração A");
  check("prioridade padrão da Folha CLT é P1 (D3)", catFolha.prioridadePadrao === "p1", catFolha);
  check("prioridade padrão de Fornecedores é P3 (D3)", catFornecedor.prioridadePadrao === "p3", catFornecedor);

  console.log("\n# Pilar 1 — caixa atual igual ao da Visão geral (antes dos dados)");
  const base0 = await baseDoPlanejador({ horizonteDias: 30 });
  const fc0 = await fluxoCaixa();
  check("S0 = fluxoCaixa().saldoTotal", base0.caixaAtual === paraCentavos(fc0.saldoTotal), { s0: base0.caixaAtual, fc: fc0.saldoTotal });

  const ids: Record<string, string> = {};
  try {
    const conta = await prisma.contaBancaria.create({ data: { nome: `${tag} conta`, saldoInicial: 1000 } });
    const catTransfSai = await prisma.categoriaFinanceira.create({
      data: { codigo: `${tag}-d`, nome: `${tag} Transferência`, tipo: "despesa", natureza: "transferencia" },
    });
    const catTransfEntra = await prisma.categoriaFinanceira.create({
      data: { codigo: `${tag}-r`, nome: `${tag} Transferência`, tipo: "receita", natureza: "transferencia" },
    });
    const comum = { autorId: admin.id, contaId: conta.id, data: em(0) };
    const criar = async (chave: string, data: Omit<Prisma.LancamentoUncheckedCreateInput, "descricao">) => {
      const l = await prisma.lancamento.create({ data: { ...data, descricao: `${tag} ${chave}` }, select: { id: true } });
      ids[chave] = l.id;
    };

    await criar("realizado", { ...comum, tipo: "receita", valor: 500, status: "confirmado", dataConfirmacao: em(0), categoriaId: catReceita.id });
    await criar("fornecedor", { ...comum, tipo: "despesa", valor: 300, status: "previsto", vencimento: em(2), categoriaId: catFornecedor.id });
    await criar("excluido", { ...comum, tipo: "despesa", valor: 200, status: "previsto", vencimento: em(3), categoriaId: catFornecedor.id, excluidoEm: new Date() });
    await criar("cancelado", { ...comum, tipo: "despesa", valor: 999, status: "cancelado", vencimento: em(1), categoriaId: catFornecedor.id });
    await criar("cliente", { ...comum, tipo: "receita", valor: 400, status: "previsto", vencimento: em(5), confianca: "confirmada_cliente", categoriaId: catReceita.id });
    await criar("transf-sai", { ...comum, tipo: "despesa", valor: 150, status: "previsto", vencimento: em(4), categoriaId: catTransfSai.id, transferenciaId: tag });
    await criar("transf-entra", { ...comum, tipo: "receita", valor: 150, status: "previsto", vencimento: em(6), categoriaId: catTransfEntra.id, transferenciaId: tag });
    await criar("transf-sozinha", { ...comum, tipo: "despesa", valor: 70, status: "previsto", vencimento: em(7), categoriaId: catTransfSai.id });

    // Parcial pelo mesmo formato das actions: original vira realizado com o efetivo, o resto nasce
    // pendente com `camposDoPlanejador` (o vitest garante que as duas actions usam o helper).
    await criar("parcial", { ...comum, tipo: "despesa", valor: 1000, status: "previsto", vencimento: em(8), prioridade: "p2", categoriaId: catFornecedor.id });
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id: ids.parcial } });
    await prisma.lancamento.update({ where: { id: original.id }, data: { status: "confirmado", valorEfetivo: 400, dataConfirmacao: em(0) } });
    await criar("resto", {
      tipo: original.tipo,
      valor: 600,
      status: "previsto",
      data: original.data,
      vencimento: original.vencimento,
      categoriaId: original.categoriaId,
      contaId: original.contaId,
      autorId: admin.id,
      ...camposDoPlanejador(original),
    });

    console.log("\n# Pilar 1 — caixa atual igual ao da Visão geral (com os dados)");
    const antesDeLer = await retrato();
    const base1 = await baseDoPlanejador({ horizonteDias: 30 });
    const fc1 = await fluxoCaixa();
    check("S0 = fluxoCaixa().saldoTotal", base1.caixaAtual === paraCentavos(fc1.saldoTotal), { s0: base1.caixaAtual, fc: fc1.saldoTotal });
    check(
      "S0 subiu só pelo que foi realizado: +1000 de saldo inicial, +500 recebido, −400 do parcial",
      base1.caixaAtual - base0.caixaAtual === paraCentavos(1000 + 500 - 400),
      { delta: base1.caixaAtual - base0.caixaAtual },
    );

    console.log("\n# Pilar 2 — só pendente vivo vira evento");
    const meus = base1.eventos.filter((e) => Object.values(ids).includes(e.id));
    const temEvento = (chave: string) => meus.some((e) => e.id === ids[chave]);
    for (const chave of ["fornecedor", "cliente", "transf-sai", "transf-entra", "transf-sozinha", "resto"]) check(`${chave} é evento`, temEvento(chave));
    for (const chave of ["realizado", "excluido", "cancelado", "parcial"]) check(`${chave} não é evento`, !temEvento(chave));
    const ev = (chave: string) => meus.find((e) => e.id === ids[chave])!;
    check("fornecedor herda P3 da categoria e é programável", ev("fornecedor").prioridade === "p3" && ev("fornecedor").naoProgramavel === null, ev("fornecedor"));
    check("cliente mantém a confiança gravada e segue pendente", ev("cliente").confianca === "confirmada_cliente" && ev("cliente").status === "previsto");
    check("pernas pareadas se enxergam", ev("transf-sai").transferencia?.contrapartes.length === 1 && ev("transf-entra").transferencia?.contrapartes.length === 1);
    check("perna sem par não tem contraparte", (ev("transf-sozinha").transferencia?.contrapartes.length ?? -1) === 0);
    check("resto do parcial: 600 e herdou P2", ev("resto").valor === paraCentavos(600) && ev("resto").prioridade === "p2", ev("resto"));

    const entrada = {
      hoje: base1.hoje,
      horizonteDias: 30,
      caixaAtual: 0,
      reservaMinima: 0,
      eventos: meus,
      caixinhas: [],
      eixos: { entradas: "todas", compromissos: "todos" } as const,
    };
    const p = projetar(entrada);
    check("entradas = 400 (transferência fora dos totais)", p.totais.entradas === paraCentavos(400), p.totais);
    check("compromissos = 300 + 600", p.totais.compromissos === paraCentavos(900), p.totais);
    check("transferências: par fecha em zero, a perna sozinha fica (−70)", p.totais.transferencias === paraCentavos(-70), p.totais);
    check("S_H = S0 + E − C + T", p.fimDoHorizonte.caixa === p.totais.entradas - p.totais.compromissos + p.totais.transferencias);
    check("um aviso: transferência sem contraparte", p.avisos.length === 1 && p.avisos[0].eventoId === ids["transf-sozinha"], p.avisos);

    console.log("\n# Pilar 3 — ler e projetar não altera o real");
    check("mesma projeção em duas execuções", JSON.stringify(projetar(entrada)) === JSON.stringify(p));
    check("nenhum lançamento criado ou alterado pela leitura", (await retrato()) === antesDeLer);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag }, excluidoEm: { not: undefined } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { codigo: { startsWith: tag } } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: tag } } });
  }

  await smokeAplicar(admin.id, catFornecedor.id, catReceita.id);
  await smokeCaixinhas(admin.id, catFornecedor.id, catReceita.id);
  await smokeDistribuicao(admin.id, catReceita.id);
  await smokeRecorrencia(admin.id, catFornecedor.id);
  await smokeNatureza(admin.id);
  await smokeDistribuicaoSocios(admin.id);
  await smokeFolhaQuitaPrevisto(admin.id);

  console.log("\n# Import do Meu Dinheiro — transferência nasce pareada e neutra");
  const categoriasAntes = new Set((await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id));
  const idUnico = String(Date.now()).slice(-9);
  const res = normalizarLinhas(
    [[
      "Transferência", "Confirmado", "2026-01-02", "2026-01-02", "-150", "-150", `${tag} import`,
      "Transferência", "", `${tag} origem`, `${tag} destino`, "", "", idUnico,
    ]],
    { tipo: 0, status: 1, data: 2, dataConfirmacao: 3, valor: 4, valorEfetivo: 5, descricao: 6, categoria: 7, subcategoria: 8, conta: 9, contaTransferencia: 10, contato: 11, documento: 12, idUnico: 13 },
  );
  let loteId: string | null = null;
  try {
    const out = await executarCommit(prisma, { nomeArquivo: `${tag}.csv`, mapeamento: {}, res, autorId: admin.id });
    loteId = out.loteId;
    const pernas = await prisma.lancamento.findMany({
      where: { importLoteId: loteId },
      select: { tipo: true, transferenciaId: true, categoria: { select: { natureza: true } } },
    });
    check("duas pernas importadas", pernas.length === 2, pernas);
    check("pernas compartilham o transferenciaId", pernas.length === 2 && pernas[0].transferenciaId != null && pernas[0].transferenciaId === pernas[1].transferenciaId, pernas);
    check("categorias das pernas têm natureza transferência", pernas.every((l) => l.categoria.natureza === "transferencia"), pernas);
  } finally {
    if (loteId) {
      await executarDesfazer(prisma, loteId);
      // Desfazer é exclusão lógica (A8): a limpeza do smoke apaga de vez.
      await prisma.lancamento.deleteMany({ where: { importLoteId: loteId, excluidoEm: { not: undefined } } });
      await prisma.importacaoFinanceira.delete({ where: { id: loteId } });
    }
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: tag } } });
    const novas = (await prisma.categoriaFinanceira.findMany({ select: { id: true } })).map((c) => c.id).filter((id) => !categoriasAntes.has(id));
    if (novas.length) await prisma.categoriaFinanceira.deleteMany({ where: { id: { in: novas }, lancamentos: { none: {} } } });
  }

  const base2 = await baseDoPlanejador({ horizonteDias: 30 });
  check("limpeza: caixa atual voltou ao de antes", base2.caixaAtual === base0.caixaAtual, { antes: base0.caixaAtual, depois: base2.caixaAtual });

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());


async function smokeAplicar(autorId: string, catDespesaId: string, catReceitaId: string) {
  const t = `${tag}-f3`;
  const ids: Record<string, string> = {};
  const configAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_FINANCEIRO } });
  const foto = async (id: string): Promise<Observado> => {
    const a = (await alvosAtuais([id])).get(id)!;
    return { status: a.status, excluido: a.excluido, data: a.data, valor: a.valor, prioridade: a.prioridade, confianca: a.confianca, caixinhaId: a.caixinhaId };
  };
  const estado = async () =>
    JSON.stringify(
      await prisma.lancamento.findMany({
        where: { id: { in: Object.values(ids) } },
        orderBy: { id: "asc" },
        select: { id: true, status: true, vencimento: true, prioridade: true, confianca: true },
      }),
    );
  const criadosPeloPlanejador = () => prisma.lancamento.count({ where: { descricao: `${t} distribuição`, excluidoEm: { not: undefined } } });

  try {
    const criar = async (chave: string, tipo: "receita" | "despesa", valor: number, venc: number) => {
      const l = await prisma.lancamento.create({
        data: { descricao: `${t} ${chave}`, tipo, valor, status: "previsto", data: em(0), vencimento: em(venc), categoriaId: tipo === "despesa" ? catDespesaId : catReceitaId, autorId },
        select: { id: true },
      });
      ids[chave] = l.id;
    };
    await criar("a", "despesa", 100, 2);
    await criar("b", "receita", 200, 5);
    await criar("c", "despesa", 50, 3);

    const ajustes = async (): Promise<AjusteSimulado[]> => [
      { tipo: "REPROGRAMAR_DATA", eventoId: ids.a, data: somarDias(hoje, 10), antes: await foto(ids.a), rotulo: "a" },
      { tipo: "ALTERAR_CONFIANCA", eventoId: ids.b, confianca: "confirmada_cliente", antes: await foto(ids.b), rotulo: "b" },
      { tipo: "ALTERAR_PRIORIDADE", eventoId: ids.c, prioridade: "p4", antes: await foto(ids.c), rotulo: "c" },
    ];

    console.log("\n# F3 — ajuste obsoleto barra a aplicação inteira");
    const lista = await ajustes();
    await prisma.lancamento.update({ where: { id: ids.c }, data: { vencimento: em(4) } }); // o real mudou depois da simulação
    const antes1 = await estado();
    let erro1 = "";
    try {
      await aplicarAjustesAoFinanceiro({ ajustes: lista, usuarioId: autorId });
    } catch (e) {
      erro1 = e instanceof Error ? e.message : String(e);
    }
    check("recusado com o motivo do item obsoleto", erro1.includes("c: o vencimento mudou"), erro1);
    check("nenhum dos três foi gravado", (await estado()) === antes1);

    console.log("\n# F3 — falha de regra no 3º item desfaz os dois primeiros (banco real)");
    const lista2: AjusteSimulado[] = [
      ...(await ajustes()).slice(0, 2),
      { tipo: "INCLUIR", id: "x", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: 1000, data: somarDias(hoje, 6), descricao: `${t} distribuição`, categoriaId: catDespesaId } },
    ];
    // Observação obrigatória: o INCLUIR (3º) passa na validação e cai na regra DENTRO da transação.
    const cfg = (configAntes?.valor ?? {}) as Record<string, unknown>;
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_FINANCEIRO },
      update: { valor: { ...cfg, obrigatorios: { ...((cfg.obrigatorios as object) ?? {}), observacao: true } } },
      create: { chave: CHAVE_CONFIG_FINANCEIRO, valor: { obrigatorios: { observacao: true } } },
    });
    const antes2 = await estado();
    let erro2 = "";
    try {
      await aplicarAjustesAoFinanceiro({ ajustes: lista2, usuarioId: autorId });
    } catch (e) {
      erro2 = e instanceof Error ? e.message : String(e);
    }
    check("a regra de obrigatório recusou", erro2.startsWith("Campo obrigatório"), erro2);
    check("os dois primeiros foram desfeitos", (await estado()) === antes2);
    check("nada foi criado", (await criadosPeloPlanejador()) === 0);
    await restaurarConfig(configAntes);

    console.log("\n# F3 — corrida: o alvo foi pago entre validar e gravar");
    const lista3 = await ajustes();
    const v = validarAplicacao(lista3, await alvosAtuais(Object.values(ids)));
    check("validação passou com os três", v.divergentes.length === 0 && v.plano.length === 3, v.divergentes);
    await prisma.lancamento.update({ where: { id: ids.c }, data: { status: "confirmado", dataConfirmacao: em(0) } });
    const antes3 = await estado();
    let erro3 = "";
    try {
      await gravarPlano(v.plano, { ajustes: lista3, indices: v.indices, cenarioId: null, usuarioId: autorId });
    } catch (e) {
      erro3 = e instanceof Error ? e.message : String(e);
    }
    check("a escrita do 3º não achou o lançamento como estava", erro3.includes("mudou enquanto o cenário era aplicado"), erro3);
    check("a e b voltaram (rollback)", (await estado()) === antes3);
    await prisma.lancamento.update({ where: { id: ids.c }, data: { status: "previsto", dataConfirmacao: null } });

    console.log("\n# F3 — caminho feliz com cenário salvo");
    const lista4: AjusteSimulado[] = [
      ...(await ajustes()),
      { tipo: "EXCLUIR", eventoId: ids.a, antes: await foto(ids.a) },
      { tipo: "INCLUIR", id: "y", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: 1000, data: somarDias(hoje, 6), descricao: `${t} distribuição`, categoriaId: catDespesaId } },
    ];
    const cenario = await prisma.cenarioFinanceiro.create({
      data: { nome: `${t} cenário`, premissas: { eixos: { entradas: "provaveis", compromissos: "todos" }, horizonteDias: 30 }, criadoPorId: autorId },
    });
    const r = await aplicarAjustesAoFinanceiro({ ajustes: lista4, cenarioId: cenario.id, usuarioId: autorId, ip: "smoke" });
    check("4 alterações aplicadas (EXCLUIR fica só na simulação)", r.aplicadas === 4 && r.indices.join(",") === "0,1,2,4", r);
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((k) => prisma.lancamento.findUniqueOrThrow({ where: { id: ids[k] } })));
    check("a: vencimento mudou", a.vencimento?.toISOString().slice(0, 10) === somarDias(hoje, 10));
    check("b: confirmada pelo cliente e ainda em aberto (status ≠ confiança)", b.confianca === "confirmada_cliente" && b.status === "previsto");
    check("c: prioridade P4", c.prioridade === "p4");
    check("distribuição criada pelo serviço de criarLancamento", (await criadosPeloPlanejador()) === 1);
    const linhas = await prisma.ajusteCenario.findMany({ where: { cenarioId: cenario.id }, orderBy: { ordem: "asc" } });
    check(
      "cenário guardou os 5 ajustes; 4 marcados como aplicados",
      linhas.length === 5 && linhas.filter((l) => l.aplicadoEm).length === 4 && linhas[3].aplicadoEm === null,
      linhas.map((l) => [l.tipo, !!l.aplicadoEm]),
    );
    const cen = await prisma.cenarioFinanceiro.findUniqueOrThrow({ where: { id: cenario.id } });
    check("cenário marcado como aplicado", cen.situacao === "aplicado" && cen.aplicadoEm != null);
    const audit = await prisma.auditLog.count({ where: { entidadeId: ids.a, acao: "aplicar-cenario-lancamento" } });
    check("histórico do lançamento registra a mudança", audit === 1, audit);

    // Excluir o cenário não mexe no que foi aplicado; o FK do ajuste solta o lançamento apagado.
    await prisma.cenarioFinanceiro.delete({ where: { id: cenario.id } });
    check("excluir o cenário não desfaz o aplicado", (await prisma.lancamento.findUniqueOrThrow({ where: { id: ids.c } })).prioridade === "p4");
  } finally {
    await restaurarConfig(configAntes);
    await prisma.cenarioFinanceiro.deleteMany({ where: { nome: { startsWith: t } } });
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
  }
}

async function restaurarConfig(antes: { valor: Prisma.JsonValue } | null) {
  if (antes) await prisma.configSistema.update({ where: { chave: CHAVE_CONFIG_FINANCEIRO }, data: { valor: antes.valor as Prisma.InputJsonValue } });
  else await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_FINANCEIRO } });
}

async function smokeCaixinhas(autorId: string, catDespesaId: string, catReceitaId: string) {
  const t = `${tag}-f4`;
  const conta = await prisma.contaBancaria.create({ data: { nome: `${t} conta`, saldoInicial: 0 } });
  try {
    console.log("\n# F4 — caixinha: alocado, uso calculado e livre que não cai duas vezes");
    const cx = await prisma.caixinha.create({ data: { nome: `${t} cx`, regra: "compromissos_ligados", horizonteDias: 30, ordem: 999 } });
    await prisma.movimentoCaixinha.create({ data: { caixinhaId: cx.id, tipo: "alocacao", valor: 1000, data: em(0), autorId } });
    const despesa = async (chave: string, valor: number, venc: number, extra: Partial<Prisma.LancamentoUncheckedCreateInput> = {}) =>
      prisma.lancamento.create({
        data: { descricao: `${t} ${chave}`, tipo: "despesa", valor, status: "previsto", data: em(0), vencimento: em(venc), categoriaId: catDespesaId, autorId, contaId: conta.id, ...extra },
        select: { id: true },
      });
    const a = await despesa("a", 400, 3, { caixinhaId: cx.id });

    const achar = async () => (await carregarCaixinhas({ hoje, inativas: true })).find((c) => c.id === cx.id)!;
    let c1 = await achar();
    check("reservado = alocado (nada usado ainda)", c1.situacao.reservado === paraCentavos(1000), c1.situacao);
    check("necessidade = a conta ligada no horizonte; completa", c1.situacao.necessidade === paraCentavos(400) && c1.situacao.estado === "completa", c1.situacao);
    check("próximo uso é a conta ligada", c1.situacao.proximoUso?.id === a.id && c1.abertas === 1);

    const base1 = await baseDoPlanejador({ horizonteDias: 30 });
    const noMotor = base1.caixinhas.find((c) => c.id === cx.id);
    check("o motor recebe o reservado real da caixinha", noMotor?.reservado === paraCentavos(1000), noMotor);
    const meus = base1.eventos.filter((e) => e.id === a.id);
    check("a conta ligada é evento com a caixinha", meus.length === 1 && meus[0].caixinhaId === cx.id, meus);
    const p = projetar({ hoje: base1.hoje, horizonteDias: 30, caixaAtual: base1.caixaAtual, reservaMinima: 0, eventos: meus, caixinhas: base1.caixinhas, eixos: { entradas: "todas", compromissos: "todos" } });
    check("400 cobertos pela caixinha, nada sem cobertura", p.totais.cobertos === paraCentavos(400) && p.totais.semCobertura === 0, p.totais);

    // Uso anterior à criação da caixinha não conta (I9).
    const velho = await despesa("velho", 250, -10, { caixinhaId: cx.id, status: "confirmado", dataConfirmacao: em(-10) });
    c1 = await achar();
    check("realizado ANTES da criação não consome o reservado", c1.situacao.reservado === paraCentavos(1000) && velho.id != null, c1.situacao);

    // Baixa da conta ligada: o caixa e o reservado caem juntos; o livre não cai duas vezes.
    const totalReservado = (x: typeof base1) => x.caixinhas.reduce((s, y) => s + y.reservado, 0);
    // Base de partida DEPOIS do realizado antigo (que também entrou no caixa), para medir só a baixa.
    const baseAntes = await baseDoPlanejador({ horizonteDias: 30 });
    const livre1 = baseAntes.caixaAtual - totalReservado(baseAntes);
    await prisma.lancamento.update({ where: { id: a.id }, data: { status: "confirmado", dataConfirmacao: em(0) } });
    const base2 = await baseDoPlanejador({ horizonteDias: 30 });
    c1 = await achar();
    check("a baixa consumiu 400 do reservado", c1.situacao.reservado === paraCentavos(600) && c1.situacao.usado === paraCentavos(400), c1.situacao);
    check("o caixa caiu 400", baseAntes.caixaAtual - base2.caixaAtual === paraCentavos(400), { antes: baseAntes.caixaAtual, depois: base2.caixaAtual });
    check("o livre NÃO caiu duas vezes: caixa − reservado ficou igual", base2.caixaAtual - totalReservado(base2) === livre1, { livre1, livre2: base2.caixaAtual - totalReservado(base2) });

    // Revisão da F4 (2026-10-01): duas liberações simultâneas do reservado passavam as duas, porque
    // a validação lê a situação antes da transação — o alocado ficava negativo e o `max(0, …)` do
    // reservado escondia. O lock da linha da caixinha serializa; a segunda é recusada.
    const antesCorrida = (await achar()).situacao.reservado;
    const corrida = await Promise.allSettled([
      movimentarNoBanco({ tipo: "liberacao", valor: antesCorrida, caixinhaId: cx.id, data: hoje }, autorId),
      movimentarNoBanco({ tipo: "liberacao", valor: antesCorrida, caixinhaId: cx.id, data: hoje }, autorId),
    ]);
    const okCorrida = corrida.filter((x) => x.status === "fulfilled").length;
    const depoisCorrida = await achar();
    check("duas liberações simultâneas: só uma passa", okCorrida === 1, corrida.map((x) => (x.status === "rejected" ? String((x.reason as Error)?.message ?? x.reason) : "ok")));
    check("e o alocado não fica negativo", depoisCorrida.situacao.alocado >= 0 && depoisCorrida.situacao.reservado === 0, depoisCorrida.situacao);
    await prisma.movimentoCaixinha.create({ data: { caixinhaId: cx.id, tipo: "alocacao", valor: 600, data: em(0), autorId } });

    console.log("\n# F4 — caixinha só em despesa em aberto, ativa; troca atômica");
    let erroReceita = "";
    try {
      await criarLancamentoNoTx(
        prisma,
        { tipo: "receita", descricao: `${t} receita`, valor: 10, data: hoje, vencimento: hoje, dataCompetencia: "", categoriaId: catReceitaId, centroId: "", contaId: "", formaId: "", projetoId: "", fornecedorId: "", clienteId: "", observacao: "", confirmado: false, ocorrencias: 1, caixinhaId: cx.id },
        autorId,
      );
    } catch (e) {
      erroReceita = e instanceof Error ? e.message : String(e);
    }
    check("receita não sai de caixinha", erroReceita === "Só conta a pagar sai de caixinha.", erroReceita);
    check("a recusa não criou o lançamento", (await prisma.lancamento.count({ where: { descricao: `${t} receita`, excluidoEm: { not: undefined } } })) === 0);

    const b = await despesa("b", 100, 4);
    const c = await despesa("c", 50, 5);
    const foto = async (id: string) => {
      const x = (await alvosAtuais([id])).get(id)!;
      return { status: x.status, excluido: x.excluido, data: x.data, valor: x.valor, prioridade: x.prioridade, confianca: x.confianca, caixinhaId: x.caixinhaId };
    };
    const lista: AjusteSimulado[] = [
      { tipo: "ALTERAR_CAIXINHA", eventoId: b.id, caixinhaId: cx.id, caixinhaNome: "cx", antes: await foto(b.id), rotulo: "b" },
      { tipo: "ALTERAR_CAIXINHA", eventoId: c.id, caixinhaId: cx.id, caixinhaNome: "cx", antes: await foto(c.id), rotulo: "c" },
    ];
    await prisma.caixinha.update({ where: { id: cx.id }, data: { ativo: false } });
    let erroArq = "";
    try {
      await aplicarAjustesAoFinanceiro({ ajustes: lista, usuarioId: autorId, ip: "smoke" });
    } catch (e) {
      erroArq = e instanceof Error ? e.message : String(e);
    }
    check("caixinha arquivada barra a aplicação inteira", erroArq.includes("não existe mais ou foi arquivada"), erroArq);
    const ligadas = async () => prisma.lancamento.count({ where: { id: { in: [b.id, c.id] }, caixinhaId: cx.id } });
    check("nenhuma conta foi ligada", (await ligadas()) === 0);

    await prisma.caixinha.update({ where: { id: cx.id }, data: { ativo: true } });
    const r = await aplicarAjustesAoFinanceiro({ ajustes: lista, usuarioId: autorId, ip: "smoke" });
    check("com a caixinha ativa, as duas contas passam a sair dela", r.aplicadas === 2 && (await ligadas()) === 2, r);
    c1 = await achar();
    check("a necessidade passou a incluir as duas contas (100 + 50)", c1.situacao.necessidade === paraCentavos(150) && c1.abertas === 2, c1.situacao);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
    await prisma.movimentoCaixinha.deleteMany({ where: { caixinha: { nome: { startsWith: t } } } });
    await prisma.caixinha.deleteMany({ where: { nome: { startsWith: t } } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: t } } });
  }
}

async function smokeDistribuicao(autorId: string, catReceitaId: string) {
  const t = `${tag}-f5`;
  const configAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_LIQUIDEZ } });
  const catTransf = await prisma.categoriaFinanceira.create({ data: { codigo: `${t}-r`, nome: `${t} Transferência`, tipo: "receita", natureza: "transferencia" } });
  const conta = await prisma.contaBancaria.create({ data: { nome: `${t} conta`, saldoInicial: 0 } });
  try {
    console.log("\n# F5 — regras de distribuição e recebimentos a distribuir");
    const desde = somarDias(hoje, -5);
    const cfg = { reservaMinima: 0, horizontePadraoDias: 30, diasParaIncerta: 30, ...((configAntes?.valor ?? {}) as object), distribuirDesde: desde };
    await prisma.configSistema.upsert({ where: { chave: CHAVE_CONFIG_LIQUIDEZ }, create: { chave: CHAVE_CONFIG_LIQUIDEZ, valor: cfg }, update: { valor: cfg } });

    const a = await prisma.caixinha.create({ data: { nome: `${t} A`, ordem: 998 } });
    const b = await prisma.caixinha.create({ data: { nome: `${t} B`, ordem: 999 } });
    const velha = await prisma.caixinha.create({ data: { nome: `${t} arquivada`, ordem: 997, ativo: false } });

    const receita = async (chave: string, valor: number, extra: Partial<Prisma.LancamentoUncheckedCreateInput> = {}) =>
      prisma.lancamento.create({
        data: { descricao: `${t} ${chave}`, tipo: "receita", valor, status: "confirmado", data: em(0), dataConfirmacao: em(0), categoriaId: catReceitaId, autorId, contaId: conta.id, ...extra },
        select: { id: true },
      });
    const r1 = await receita("r1", 100.01);
    const r2 = await receita("r2-reembolso", 50, { tags: ["reembolso-art"] });
    const r3 = await receita("r3-antes-da-data", 50, { dataConfirmacao: em(-30) });
    const r4 = await receita("r4-em-aberto", 50, { status: "previsto", dataConfirmacao: null, vencimento: em(3) });
    const r5 = await receita("r5-transferencia", 50, { categoriaId: catTransf.id });
    const r6 = await receita("r6-pular", 70);
    const r7 = await receita("r7-corrida", 200);

    const fila = async () => (await recebimentosADistribuir(desde)).filter((x) => x.descricao.startsWith(t)).map((x) => x.id);
    const entrou = await fila();
    check("a fila tem só os elegíveis: r1, r6 e r7", [r1.id, r6.id, r7.id].every((id) => entrou.includes(id)) && entrou.length === 3, entrou.length);
    check("reembolso de ART, anterior à data inicial, em aberto e transferência ficam de fora", [r2.id, r3.id, r4.id, r5.id].every((id) => !entrou.includes(id)));
    check("sem data inicial, nada é oferecido", (await recebimentosADistribuir(null)).length === 0);

    console.log("\n# F5 — regra: precisa fechar 100%");
    let erroSoma = "";
    try {
      await gravarRegra({ nome: `${t} regra`, categoriasIds: [], itens: [{ caixinhaId: null, bp: 4000 }, { caixinhaId: a.id, bp: 3000 }, { caixinhaId: b.id, bp: 2500 }] });
    } catch (e) {
      erroSoma = e instanceof Error ? e.message : String(e);
    }
    check("95% é recusado com os 5% que faltam", erroSoma === "Faltam 5% para fechar 100%.", erroSoma);
    let erroArq = "";
    try {
      await gravarRegra({ nome: `${t} regra`, categoriasIds: [], itens: [{ caixinhaId: null, bp: 5000 }, { caixinhaId: velha.id, bp: 5000 }] });
    } catch (e) {
      erroArq = e instanceof Error ? e.message : String(e);
    }
    check("caixinha arquivada na divisão é recusada", erroArq.includes("arquivada"), erroArq);
    const itens = [{ caixinhaId: null, bp: 4000 }, { caixinhaId: a.id, bp: 3500 }, { caixinhaId: b.id, bp: 2500 }];
    const regra = await gravarRegra({ nome: `${t} regra`, categoriasIds: [], itens });
    const gravada = await prisma.regraDistribuicao.findUniqueOrThrow({ where: { id: regra.id }, include: { itens: { orderBy: { ordem: "asc" } } } });
    check("regra gravada com os itens na ordem e soma 10000", gravada.itens.map((i) => i.bp).join(",") === "4000,3500,2500", gravada.itens);

    console.log("\n# F5 — distribuir: rateio exato, a parte livre não move nada");
    const cx = async (id: string) => (await carregarCaixinhas({ hoje, inativas: true })).find((c) => c.id === id)!;
    const res = await distribuirRecebimento({ lancamentoId: r1.id, regraId: regra.id, itens, usuarioId: autorId });
    check("duas alocações (a e b); a livre não gerou movimento", res.movimentos === 2, res);
    check("R$ 100,01: livre 40,00 · A 35,00 · B recebe o resto 25,01", res.reservado === 6001, res);
    check("A reservou 35,00 e B 25,01", (await cx(a.id)).situacao.reservado === 3500 && (await cx(b.id)).situacao.reservado === 2501);
    const movs = await prisma.movimentoCaixinha.findMany({ where: { distribuicao: { lancamentoId: r1.id } } });
    check("os movimentos apontam para a distribuição", movs.length === 2 && movs.every((m) => m.tipo === "alocacao" && m.distribuicaoId != null));
    check("o recebimento saiu da fila", !(await fila()).includes(r1.id));
    let erroDupla = "";
    try {
      await distribuirRecebimento({ lancamentoId: r1.id, regraId: regra.id, itens, usuarioId: autorId });
    } catch (e) {
      erroDupla = e instanceof Error ? e.message : String(e);
    }
    check("distribuir de novo é recusado", erroDupla.includes("já foi distribuído"), erroDupla);
    check("e o reservado não dobrou", (await cx(a.id)).situacao.reservado === 3500);

    console.log("\n# F5 — duas confirmações ao mesmo tempo reservam uma vez só");
    const corrida = await Promise.allSettled([
      distribuirRecebimento({ lancamentoId: r7.id, regraId: regra.id, itens, usuarioId: autorId }),
      distribuirRecebimento({ lancamentoId: r7.id, regraId: regra.id, itens, usuarioId: autorId }),
    ]);
    check("exatamente uma passou", corrida.filter((x) => x.status === "fulfilled").length === 1, corrida.map((x) => x.status));
    check("a caixinha A tem 35,00 + 70,00 (3500 de r1 + 7000 de r7), nunca o dobro", (await cx(a.id)).situacao.reservado === 3500 + 7000, (await cx(a.id)).situacao.reservado);

    console.log("\n# F5 — pular e o que não é elegível");
    await pularRecebimento({ lancamentoId: r6.id, usuarioId: autorId });
    check("pulado sai da fila e não reserva nada", !(await fila()).includes(r6.id) && (await prisma.movimentoCaixinha.count({ where: { distribuicao: { lancamentoId: r6.id } } })) === 0);
    for (const [nome, id] of [["reembolso", r2.id], ["anterior à data", r3.id], ["em aberto", r4.id], ["transferência", r5.id]] as const) {
      let erro = "";
      try {
        await distribuirRecebimento({ lancamentoId: id, regraId: null, itens, usuarioId: autorId });
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      check(`${nome} não pode ser distribuído`, erro.includes("não está na lista"), erro);
    }
    check("nada foi reservado pelos recusados", (await cx(a.id)).situacao.reservado === 3500 + 7000);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
    await prisma.movimentoCaixinha.deleteMany({ where: { caixinha: { nome: { startsWith: t } } } });
    await prisma.regraDistribuicao.deleteMany({ where: { nome: { startsWith: t } } });
    await prisma.caixinha.deleteMany({ where: { nome: { startsWith: t } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { codigo: { startsWith: t } } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: t } } });
    if (configAntes) await prisma.configSistema.update({ where: { chave: CHAVE_CONFIG_LIQUIDEZ }, data: { valor: configAntes.valor as Prisma.InputJsonValue } });
    else await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_LIQUIDEZ } });
  }
}

async function smokeRecorrencia(autorId: string, catDespesaId: string) {
  const t = `${tag}-f6a`;
  const compAtual = competenciaDe(hoje);
  try {
    console.log("\n# F6A — compromisso recorrente: projeção, geração idempotente e vínculo");
    const c = await prisma.compromissoRecorrente.create({
      data: {
        descricao: `${t} pró-labore`,
        valor: 6000,
        // Vence hoje: o mês corrente está dentro da antecedência, então o gerador pega.
        diaVencimento: Number(hoje.slice(8, 10)),
        competenciaInicio: compAtual,
        categoriaId: catDespesaId,
        antecedenciaDias: 5,
      },
      select: { id: true, diaVencimento: true },
    });
    const idProg = idDoProgramado(c.id, compAtual);
    const base1 = await baseDoPlanejador({ horizonteDias: 30 });
    const prog = base1.eventos.find((e) => e.id === idProg);
    check("mês sem lançamento é projetado como Programado", prog?.origem === "programado" && prog.valor === paraCentavos(6000), prog?.origem);
    check("o vencimento é o dia do compromisso na competência", prog?.data === vencimentoDa(compAtual, c.diaVencimento), prog?.data);
    check("o mês programado não é lançamento: data com dono e sem status", prog?.naoProgramavel != null && prog?.status === null);
    check("a descrição diz a competência", prog?.descricao === `${t} pró-labore · ${rotuloDaCompetencia(compAtual)}`, prog?.descricao);

    console.log("\n# F6A — geração: duas execuções ao mesmo tempo criam o mês uma vez só");
    const [r1, r2] = await Promise.all([gerarLancamentosRecorrentes({ autorId }), gerarLancamentosRecorrentes({ autorId })]);
    const gerados = await prisma.lancamento.findMany({ where: { recorrenciaOrigemId: c.id }, select: { id: true, status: true, valor: true, recorrenciaCompetencia: true, vencimento: true } });
    check("exatamente um lançamento para a competência", gerados.length === 1 && gerados[0].recorrenciaCompetencia === compAtual, gerados.length);
    check("as duas execuções somam 1 criação", r1.criados + r2.criados === 1, { r1: r1.criados, r2: r2.criados });
    check("nasce previsto, com o valor e o vencimento do compromisso", gerados[0].status === "previsto" && paraCentavos(gerados[0].valor) === paraCentavos(6000));
    const base2 = await baseDoPlanejador({ horizonteDias: 30 });
    check("gerado: o mês deixa de ser projetado e o lançamento é que conta", !base2.eventos.some((e) => e.id === idProg) && base2.eventos.some((e) => e.id === gerados[0].id));
    check("rodar de novo não cria nada", (await gerarLancamentosRecorrentes({ autorId })).criados === 0);

    console.log("\n# F6A — vínculo manual (§9): sem vínculo os dois contam e o aviso avisa");
    const prox = await prisma.compromissoRecorrente.create({
      data: { descricao: `${t} aluguel`, valor: 2000, diaVencimento: 28, competenciaInicio: compAtual, categoriaId: catDespesaId, antecedenciaDias: 0 },
      select: { id: true },
    });
    const manual = await prisma.lancamento.create({
      data: {
        descricao: `${t} aluguel pago à mão`,
        tipo: "despesa",
        valor: 1500,
        status: "previsto",
        data: em(0),
        vencimento: new Date(`${vencimentoDa(compAtual, 28)}T00:00:00.000Z`),
        categoriaId: catDespesaId,
        autorId,
      },
      select: { id: true },
    });
    const base3 = await baseDoPlanejador({ horizonteDias: 60 });
    const meus3 = base3.avisosRecorrencia.filter((a) => a.compromissoId === prox.id);
    check("avisa possível pagamento em dobro", meus3.some((a) => a.tipo === "dobro" && a.lancamentoId === manual.id), meus3.map((a) => a.tipo));
    check("sem vínculo, o mês continua projetado (os dois contam, lado seguro)", base3.eventos.some((e) => e.id === idDoProgramado(prox.id, compAtual)));

    await vincularLancamento({ lancamentoId: manual.id, compromissoId: prox.id, competencia: compAtual });
    const base4 = await baseDoPlanejador({ horizonteDias: 60 });
    check("vinculado: o mês sai da projeção", !base4.eventos.some((e) => e.id === idDoProgramado(prox.id, compAtual)));
    const aviso = base4.avisosRecorrencia.find((a) => a.lancamentoId === manual.id);
    check("vale o valor do lançamento e a diferença vira aviso", aviso?.tipo === "abaixo" && aviso.diferenca === paraCentavos(500), aviso);

    let erroDupla = "";
    try {
      await vincularLancamento({ lancamentoId: manual.id, compromissoId: prox.id, competencia: compAtual });
    } catch (e) {
      erroDupla = e instanceof Error ? e.message : String(e);
    }
    check("vincular de novo é recusado", erroDupla.includes("já está vinculado"), erroDupla);
    check("e o mês vinculado nunca é gerado", (await gerarLancamentosRecorrentes({ autorId })).criados === 0);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
    await prisma.compromissoRecorrente.deleteMany({ where: { descricao: { startsWith: t } } });
  }
}

async function smokeNatureza(autorId: string) {
  const t = `${tag}-f6c`;
  const conta = await prisma.contaBancaria.create({ data: { nome: `${t} conta`, saldoInicial: 0 } });
  const de = new Date(`${somarDias(hoje, -1)}T00:00:00.000Z`);
  const ate = new Date(`${somarDias(hoje, 1)}T23:59:59.000Z`);
  try {
    console.log("\n# F6C — fora do resultado: DRE, DFC, aging e balanço (spec §8)");
    const cat = async (chave: string, nome: string, tipo: "receita" | "despesa", natureza: "resultado" | "fora_do_resultado" | "transferencia", grupoDfc: string) =>
      prisma.categoriaFinanceira.create({ data: { codigo: `${t}-${chave}`, nome: `${t} ${nome}`, tipo, natureza, grupoDfc }, select: { id: true, nome: true } });
    const prolabore = await cat("pl", "Pró-labore", "despesa", "resultado", "operacional");
    const distrib = await cat("dl", "Distribuição de lucros", "despesa", "fora_do_resultado", "financiamento");
    const tSai = await cat("ts", "Transferência saída", "despesa", "transferencia", "operacional");
    const tEnt = await cat("te", "Transferência entrada", "receita", "transferencia", "operacional");
    const receita = await cat("rc", "Projetos", "receita", "resultado", "operacional");

    const realizado = async (chave: string, categoriaId: string, tipo: "receita" | "despesa", valor: number) =>
      prisma.lancamento.create({
        data: { descricao: `${t} ${chave}`, tipo, valor, status: "confirmado", data: em(0), dataConfirmacao: em(0), categoriaId, autorId, contaId: conta.id },
        select: { id: true },
      });
    await realizado("receita", receita.id, "receita", 10_000);
    await realizado("prolabore", prolabore.id, "despesa", 6_000);
    await realizado("distribuicao", distrib.id, "despesa", 20_000);
    await realizado("transf-sai", tSai.id, "despesa", 5_000);
    await realizado("transf-ent", tEnt.id, "receita", 5_000);

    const dre = await relatorioDRE(de, ate);
    const linhasDre = [...dre.receitas, ...dre.despesas].filter((l) => l.codigo.startsWith(t));
    check("DRE tem a receita e o pró-labore", linhasDre.some((l) => l.nome.includes("Pró-labore")) && linhasDre.some((l) => l.nome.includes("Projetos")), linhasDre.map((l) => l.nome));
    check("DRE NÃO tem a distribuição de lucros nem a transferência", !linhasDre.some((l) => /Distribui|Transfer/.test(l.nome)), linhasDre.map((l) => l.nome));

    const dfc = await relatorioDFC(de, ate);
    const linhasDfc = dfc.atividades.flatMap((a) => a.linhas.filter((l) => l.codigo.startsWith(t)).map((l) => `${a.grupo}:${l.nome}`));
    check("DFC tem a distribuição em financiamento", linhasDfc.some((x) => x.startsWith("financiamento:") && x.includes("Distribui")), linhasDfc);
    check("DFC NÃO tem as pernas de transferência", !linhasDfc.some((x) => x.includes("Transfer")), linhasDfc);

    // Pendentes: uma despesa de transferência e uma de distribuição, para aging e balanço.
    const pendente = async (chave: string, categoriaId: string, tipo: "receita" | "despesa", valor: number) =>
      prisma.lancamento.create({
        data: { descricao: `${t} ${chave}`, tipo, valor, status: "previsto", data: em(0), vencimento: em(2), categoriaId, autorId, contaId: conta.id },
        select: { id: true },
      });
    const pTransf = await pendente("p-transf", tSai.id, "despesa", 3_000);
    const pDistrib = await pendente("p-distrib", distrib.id, "despesa", 7_000);
    // Aging soma por faixa: a transferência a pagar não pode entrar no total a vencer.
    const agingAntes = await agingReport("despesa");
    await prisma.lancamento.update({ where: { id: pTransf.id }, data: { valor: 50_000 } });
    const agingDepois = await agingReport("despesa");
    check("aging ignora a perna de transferência", agingAntes.totalAVencer === agingDepois.totalAVencer, { antes: agingAntes.totalAVencer, depois: agingDepois.totalAVencer });
    await prisma.lancamento.update({ where: { id: pDistrib.id }, data: { valor: 9_000 } });
    const agingComDistrib = await agingReport("despesa");
    check("aging mantém a distribuição a pagar (é obrigação real)", agingComDistrib.totalAVencer - agingDepois.totalAVencer === 2_000, { delta: agingComDistrib.totalAVencer - agingDepois.totalAVencer });

    const kpi = await indicadores(de, ate);
    check("o KPI de recebido não conta a perna de transferência", kpi.recebido === 10_000, kpi.recebido);

    const antes = await balancoGerencial();
    await prisma.lancamento.update({ where: { id: pTransf.id }, data: { valor: 9_000 } });
    const depois = await balancoGerencial();
    check("o balanço não muda quando a perna de transferência muda", antes.aPagar === depois.aPagar, { antes: antes.aPagar, depois: depois.aPagar });
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { codigo: { startsWith: t } } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: t } } });
  }
}

async function smokeDistribuicaoSocios(autorId: string) {
  const t = `${tag}-f6b`;
  try {
    console.log("\n# F6B — distribuição de lucros pelo percentual de cada sócio");
    const cat = await prisma.categoriaFinanceira.findUnique({ where: { chave: "distribuicao_lucros" }, select: { id: true, natureza: true, grupoDfc: true, tipo: true } });
    check("a categoria 3.01 existe, é despesa fora do resultado e DFC de financiamento", cat?.tipo === "despesa" && cat?.natureza === "fora_do_resultado" && cat?.grupoDfc === "financiamento", cat);
    const adiant = await prisma.categoriaFinanceira.findUnique({ where: { chave: "adiantamento_lucros" }, select: { natureza: true } });
    check("a categoria 3.02 (adiantamento) também é fora do resultado", adiant?.natureza === "fora_do_resultado", adiant);
    if (!cat) return;

    // Três sócios de teste: 50 / 30 / 20 (users novos, para não mexer no cadastro real).
    const nomes = ["A", "B", "C"];
    const pct = [50, 30, 20];
    const socios: { id: string; nome: string; percentualBp: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({ data: { name: `${t} sócio ${nomes[i]}`, email: `${t}-${i}@dev.local`, role: "administrativo", tipo: "interno" }, select: { id: true, name: true } });
      const s = await prisma.socio.create({ data: { userId: u.id, percentual: pct[i] }, select: { id: true } });
      socios.push({ id: s.id, nome: u.name, percentualBp: percentualParaBp(pct[i]) });
    }
    check("os percentuais fecham 100%", motivoDoRateio(socios) === null);
    const partes = ratearEntreSocios(paraCentavos(10_000.01), socios);
    check("R$ 10.000,01 vira 5.000,00 / 3.000,00 / 2.000,01 (o resto no último)", partes.map((p) => p.valor).join("/") === [500_000, 300_000, 200_001].join("/"), partes.map((p) => p.valor));

    for (const p of partes) {
      await prisma.lancamento.create({
        data: { descricao: `${t} ${p.nome}`, tipo: "despesa", valor: p.valor / 100, status: "previsto", data: em(0), vencimento: em(2), categoriaId: cat.id, socioId: p.socioId, autorId },
      });
    }
    const criados = await prisma.lancamento.findMany({ where: { descricao: { startsWith: t } }, select: { socioId: true, valor: true } });
    check("uma conta a pagar por sócio, com o sócio gravado", criados.length === 3 && criados.every((l) => l.socioId != null));
    check("a soma fecha o total distribuído", criados.reduce((s, l) => s + paraCentavos(l.valor), 0) === paraCentavos(10_000.01));

    const dre = await relatorioDRE(new Date(`${somarDias(hoje, -1)}T00:00:00.000Z`), new Date(`${somarDias(hoje, 3)}T23:59:59.000Z`));
    check("a distribuição não entra na DRE nem quando é paga", ![...dre.despesas].some((l) => l.nome.includes("Distribuição de lucros")), dre.despesas.map((l) => l.nome));

    // Percentual fora de 100% recusa a divisão (a action usa o mesmo motivo).
    await prisma.socio.update({ where: { id: socios[2].id }, data: { percentual: 10 } });
    check("com 90% a divisão é recusada, dizendo a soma", (motivoDoRateio([...socios.slice(0, 2), { ...socios[2], percentualBp: 1000 }]) ?? "").includes("somam 90%"));
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: t }, excluidoEm: { not: undefined } } });
    await prisma.socio.deleteMany({ where: { user: { email: { startsWith: t } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: t } } });
  }
}

async function smokeFolhaQuitaPrevisto(autorId: string) {
  const t = `${tag}-n0folha`;
  // Ano 2040 para não colidir com folha real do banco de dev. Folha de JULHO, paga em AGOSTO.
  const ano = 2040;
  const cat = await prisma.categoriaFinanceira.findUnique({ where: { chave: "despesa_folha_clt" }, select: { id: true } });
  const pessoa = await prisma.user.create({ data: { name: `${t} CLT`, email: `${t}@dev.local`, role: "clt", tipo: "interno" }, select: { id: true } });
  // O fechamento reescreve a descrição ("Folha CLT 07/2040"), então a tag sozinha não acha a conta.
  const doTeste = { OR: [{ descricao: { startsWith: t } }, { descricao: { startsWith: "Folha CLT " }, dataCompetencia: { gte: new Date(`${ano}-01-01T00:00:00.000Z`), lt: new Date(`${ano + 1}-01-01T00:00:00.000Z`) } }] };
  const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);
  try {
    console.log("\n# N0 — folha CLT: fechar define o valor, paga no mês seguinte, adiantamento à parte");
    if (!cat) return check("a categoria da folha CLT existe pela chave", false);

    const folhaDe = async (mes: number, tipo: "mensal" | "decimo_terceiro", liquido: number) => {
      const f = await prisma.folhaPagamento.create({ data: { ano, mes, tipo }, select: { id: true } });
      const h = await prisma.holerite.create({ data: { folhaId: f.id, userId: pessoa.id }, select: { id: true } });
      await prisma.holeriteItem.create({ data: { holeriteId: h.id, descricao: `${t} salário`, tipo: "provento", valor: liquido } });
      return f.id;
    };
    const conta = async (venc: string, valor: number, extra: Record<string, unknown> = {}) =>
      prisma.lancamento.create({
        data: { descricao: `${t} conta`, tipo: "despesa", valor, status: "previsto", data: dia(venc), vencimento: dia(venc), categoriaId: cat.id, autorId, ...extra },
        select: { id: true },
      });

    // Folha: 5º dia útil do mês seguinte. Adiantamento: dia 20 do próprio mês, mesma competência.
    const rec = await prisma.compromissoRecorrente.create({
      data: { descricao: `${t} folha`, valor: 40_000, diaVencimento: 5, regraVencimento: "dia_util", mesesAteVencimento: 1, competenciaInicio: `${ano}-07`, categoriaId: cat.id },
      select: { id: true },
    });
    const adiant = await prisma.compromissoRecorrente.create({
      data: { descricao: `${t} adiantamento`, valor: 16_000, diaVencimento: 20, competenciaInicio: `${ano}-07`, adiantamento: true, categoriaId: cat.id },
      select: { id: true },
    });

    // 1. Julho: a conta da recorrência (vence 07/08) recebe o líquido real e CONTINUA em aberto.
    const saldo = await conta(`${ano}-08-07`, 40_000, { recorrenciaOrigemId: rec.id, recorrenciaCompetencia: `${ano}-07` });
    const cAdiant = await conta(`${ano}-07-20`, 16_000, { recorrenciaOrigemId: adiant.id, recorrenciaCompetencia: `${ano}-07` });
    const folhaJul = await folhaDe(7, "mensal", 25_500);
    const r1 = await fecharFolhaNoBanco(folhaJul, autorId);
    check("A1: a folha de julho atualiza a conta de julho que vence em AGOSTO", r1.acao === "atualizou" && r1.lancamentoId === saldo.id, r1);
    const s1 = await prisma.lancamento.findUnique({ where: { id: saldo.id }, select: { status: true, valor: true, dataCompetencia: true } });
    check("fechar não é pagar: a conta continua em aberto, com o líquido real", s1?.status === "previsto" && paraCentavos(s1.valor) === paraCentavos(25_500), s1);
    check("competência pura: a conta é de julho, mesmo vencendo em agosto", s1?.dataCompetencia?.toISOString().slice(0, 10) === `${ano}-07-01`, s1?.dataCompetencia);
    const a1 = await prisma.lancamento.findUnique({ where: { id: cAdiant.id }, select: { valor: true, status: true } });
    check("o adiantamento de salário não é tocado", a1?.status === "previsto" && paraCentavos(a1.valor) === paraCentavos(16_000), a1);
    check("o aviso diz de quanto para quanto", (r1.aviso ?? "").includes("passou de R$ 40.000,00 para R$ 25.500,00"), r1.aviso);

    // 2. Reabrir com a conta em aberto: nada é apagado nem revertido.
    await reabrirFolhaNoBanco(folhaJul);
    const s2 = await prisma.lancamento.findUnique({ where: { id: saldo.id }, select: { status: true, valor: true, excluidoEm: true } });
    check("reabrir não apaga nem reverte a conta da competência", s2?.excluidoEm === null && paraCentavos(s2.valor) === paraCentavos(25_500), s2);

    // 3. Pagaram antes de fechar de novo: não nasce outra conta; reabrir depois de pago é recusado.
    await prisma.lancamento.update({ where: { id: saldo.id }, data: { status: "confirmado", dataConfirmacao: dia(`${ano}-08-07`) } });
    const r3 = await fecharFolhaNoBanco(folhaJul, autorId);
    const contasJul = await prisma.lancamento.count({ where: { ...doTeste, excluidoEm: null, recorrenciaOrigemId: rec.id } });
    check("folha já paga: nada nasce e o fechamento aponta a conta paga", r3.acao === "ja_paga" && r3.lancamentoId === saldo.id && contasJul === 1, { r3, contasJul });
    let recusou = "";
    try {
      await reabrirFolhaNoBanco(folhaJul);
    } catch (e) {
      recusou = (e as Error).message;
    }
    check("reabrir folha já paga é recusado", recusou.includes("estorne o pagamento"), recusou);

    // 4. Agosto, com a recorrência e sem conta ainda: nasce a conta, LIGADA à recorrência, vencendo no
    //    5º dia útil de setembro: salário conta o sábado (1/9 é sábado: 1, 3, 4, 5, 6 → 06/09; o feriado de 7/9 já não entra).
    const folhaAgo = await folhaDe(8, "mensal", 30_000);
    const r4 = await fecharFolhaNoBanco(folhaAgo, autorId);
    const c4 = await prisma.lancamento.findUnique({ where: { id: r4.lancamentoId }, select: { status: true, recorrenciaOrigemId: true, recorrenciaCompetencia: true } });
    check("sem conta: nasce a conta da competência, em aberto", r4.acao === "criou" && c4?.status === "previsto", { r4, c4 });
    check("vence no 5º dia útil do mês seguinte, com o sábado contando (salário)", r4.vencimento === `${ano}-09-06`, r4.vencimento);
    check("nasce ligada à recorrência (o gerador não cria o mês de novo)", c4?.recorrenciaOrigemId === rec.id && c4.recorrenciaCompetencia === `${ano}-08`, c4);

    // 5. 13º: outra despesa, não mexe na conta da mensal.
    const folha13 = await folhaDe(8, "decimo_terceiro", 20_000);
    const r5 = await fecharFolhaNoBanco(folha13, autorId);
    check("o 13º cria a conta dele e não toca na da mensal", r5.acao === "criou" && r5.lancamentoId !== r4.lancamentoId, r5);
  } finally {
    const folhas = await prisma.folhaPagamento.findMany({ where: { ano }, select: { id: true } });
    for (const f of folhas) {
      await prisma.holeriteItem.deleteMany({ where: { holerite: { folhaId: f.id } } });
      await prisma.holerite.deleteMany({ where: { folhaId: f.id } });
    }
    await prisma.folhaPagamento.deleteMany({ where: { ano } });
    await prisma.lancamento.deleteMany({ where: { ...doTeste, excluidoEm: { not: undefined } } });
    await prisma.compromissoRecorrente.deleteMany({ where: { descricao: { startsWith: t } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: t } } });
  }
}
