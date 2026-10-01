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
    return { status: a.status, excluido: a.excluido, data: a.data, valor: a.valor, prioridade: a.prioridade, confianca: a.confianca };
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
