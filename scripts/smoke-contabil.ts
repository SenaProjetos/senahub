/**
 * Smoke da integração contábil (M5, fases C0–C3) contra o banco de dev. Cria um mês isolado (2019-03) com
 * uma conta bancária, um cartão e lançamentos de teste, e confere o que o vitest não alcança:
 *
 *   C0. O plano do contador importa (idempotente) e o de-para recusa conta sintética / fora do plano.
 *   C2. Partidas lidas do banco: reconhecimento + baixa, parcial nasce uma vez, cartão numa linha por fatura,
 *       transferência numa linha, folha fora (o contador lança), pendência da categoria sem conta, e a
 *       INVARIANTE: o banco no arquivo + o que ficou fora = entradas − saídas do Extrato por conta.
 *   C3. Exportar mês aberto é recusado; fechado, registra a exportação com as linhas e o hash.
 *   C5. Layout do contador (modelo .xls dele): recusa o mês com linha sem conta; com o de-para completo registra e as
 *       linhas viram o modelo de 5 colunas + centro de custo e projeto à direita, todas com débito e crédito numéricos.
 *
 * Tudo o que cria é apagado no fim (mesmo com falha). Uso: npm run smoke:contabil
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { utcInicioDoDia } from "../src/lib/data";
import { lerPlanoCsv } from "../src/modules/financeiro/contabil/plano";
import { movimentoDaConta } from "../src/modules/financeiro/contabil/partidas";
import { linhasDoAlterdata, linhasSemConta, MOTIVO_ALTERDATA_SEM_CONTA } from "../src/modules/financeiro/contabil/arquivo";
import {
  MOTIVO_CONTA_FORA_DO_PLANO,
  MOTIVO_CONTA_SINTETICA,
  MOTIVO_MES_ABERTO,
  definirContaNoBanco,
  hashDasLinhas,
  importarPlanoNoBanco,
  partidasDoMes,
  registrarExportacaoNoBanco,
} from "../src/modules/financeiro/contabil/service";
import { extratoDaConta } from "../src/modules/financeiro/extrato/queries";

const MES = "2019-03";
const MARCA = "[smoke contábil]";
const BANCO = 3395; // BANCO CAIXA ECONOMICA no plano do contador
const CHAVE = "35190312345678000195550010000033811000033812";

let falhas = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ ${msg}`);
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

const dia = (d: number) => utcInicioDoDia(2019, 2, d);

async function limpar(ids: { conta?: string; cartao?: string; categoria?: string; centro?: string }) {
  await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: MARCA } } });
  if (ids.cartao) {
    await prisma.faturaCartao.deleteMany({ where: { cartaoId: ids.cartao } });
    await prisma.cartaoCredito.deleteMany({ where: { id: ids.cartao } });
  }
  if (ids.conta) {
    await prisma.deParaContabil.deleteMany({ where: { alvo: "conta_bancaria", alvoId: ids.conta } });
    await prisma.contaBancaria.deleteMany({ where: { id: ids.conta } });
  }
  const alvos = [ids.cartao, ids.categoria].filter((x): x is string => !!x);
  if (alvos.length) await prisma.deParaContabil.deleteMany({ where: { alvoId: { in: alvos } } });
  if (ids.categoria) await prisma.categoriaFinanceira.deleteMany({ where: { id: ids.categoria } });
  if (ids.centro) await prisma.centroCusto.deleteMany({ where: { id: ids.centro } });
  await prisma.exportacaoContabil.deleteMany({ where: { competencia: MES } });
  await prisma.fechamentoMensal.deleteMany({ where: { ano: 2019, mes: 3 } });
}

async function main() {
  const ids: { conta?: string; cartao?: string; categoria?: string; centro?: string } = {};
  try {
    console.log("C0 · plano do contador");
    const { contas, erros } = lerPlanoCsv(readFileSync(path.resolve(__dirname, "../docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv"), "utf8"));
    ok(erros.length === 0, "CSV do plano lê sem erro");
    await importarPlanoNoBanco(contas);
    const r2 = await importarPlanoNoBanco(contas);
    ok(r2.criadas === 0 && r2.alteradas === 0 && r2.iguais === contas.length, "re-importar o mesmo plano não muda nada");

    const autor = await prisma.user.findFirstOrThrow({ where: { superUsuario: true, ativo: true }, select: { id: true } });
    if (await prisma.fechamentoMensal.findUnique({ where: { ano_mes: { ano: 2019, mes: 3 } } })) throw new Error("Já existe fechamento de 03/2019 no banco: o smoke usa esse mês isolado.");
    const cat = async (chave: string) => (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { chave }, select: { id: true } })).id;
    const receita = await cat("receita_projetos_particulares");
    const admin = await cat("despesa_administrativas");
    const folha = await cat("despesa_folha_clt");
    const transf = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { natureza: "transferencia", tipo: "despesa" }, select: { id: true } })).id;
    const transfEntrada = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { natureza: "transferencia", tipo: "receita" }, select: { id: true } })).id;

    const conta = await prisma.contaBancaria.create({ data: { nome: `${MARCA} banco`, saldoInicial: 0 } });
    ids.conta = conta.id;
    const outra = await prisma.contaBancaria.create({ data: { nome: `${MARCA} outra`, saldoInicial: 0 } });
    const cartao = await prisma.cartaoCredito.create({ data: { nome: `${MARCA} cartão`, diaFechamento: 25, diaVencimento: 5 } });
    ids.cartao = cartao.id;
    const fatura = await prisma.faturaCartao.create({ data: { cartaoId: cartao.id, competencia: MES, inicioCiclo: dia(1), fimCiclo: dia(25), vencimento: dia(28) } });
    const semConta = await prisma.categoriaFinanceira.create({ data: { codigo: `9.99.${Date.now() % 100000}`, nome: `${MARCA} sem conta`, tipo: "despesa" } });
    ids.categoria = semConta.id;

    await recusa(definirContaNoBanco("conta_bancaria", conta.id, 1624), "de-para recusa conta sintética", MOTIVO_CONTA_SINTETICA);
    await recusa(definirContaNoBanco("conta_bancaria", conta.id, 999999), "de-para recusa conta fora do plano", MOTIVO_CONTA_FORA_DO_PLANO);
    await definirContaNoBanco("conta_bancaria", conta.id, BANCO);

    const base = { autorId: autor.id, data: dia(10) };
    const pago = (d: number, contaId = conta.id) => ({ status: "confirmado" as const, dataConfirmacao: dia(d), contaId });
    const criar = (d: Parameters<typeof prisma.lancamento.create>[0]["data"]) => prisma.lancamento.create({ data: d, select: { id: true } });

    const centro = await prisma.centroCusto.create({ data: { nome: `${MARCA} centro` } });
    ids.centro = centro.id;
    const projeto = await prisma.projeto.findFirst({ select: { id: true, codigo: true } });
    const rec = await criar({ ...base, tipo: "receita", descricao: `${MARCA} parcela`, valor: 450, categoriaId: receita, ...pago(12), numeroDocumento: "NF 3381", chaveNfe: CHAVE, centroId: centro.id, ...(projeto ? { projetoId: projeto.id } : {}) });
    const aluguel = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} aluguel`, valor: 65, categoriaId: admin, ...pago(10) });
    const aberto = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} em aberto`, valor: 20, categoriaId: admin, status: "previsto" });
    const original = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} parcial`, valor: 100, valorEfetivo: 60, categoriaId: admin, ...pago(15) });
    const resto = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} parcial (resto)`, valor: 40, categoriaId: admin, restanteDeId: original.id, ...pago(25) });
    const salario = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} folha`, valor: 240, categoriaId: folha, ...pago(5) });
    const t = `smoke-contabil-${Date.now()}`;
    await criar({ ...base, tipo: "despesa", descricao: `${MARCA} transferência`, valor: 30, categoriaId: transf, transferenciaId: t, ...pago(11) });
    await criar({ ...base, tipo: "receita", descricao: `${MARCA} transferência`, valor: 30, categoriaId: transfEntrada, transferenciaId: t, ...pago(11, outra.id) });
    const compra1 = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} compra 1`, valor: 5, categoriaId: admin, cartaoId: cartao.id, faturaId: fatura.id, dataCompetencia: dia(3), ...pago(28) });
    await criar({ ...base, tipo: "despesa", descricao: `${MARCA} compra 2`, valor: 7, categoriaId: admin, cartaoId: cartao.id, faturaId: fatura.id, dataCompetencia: dia(8), ...pago(28) });
    const pendente = await criar({ ...base, tipo: "despesa", descricao: `${MARCA} sem de-para`, valor: 3, categoriaId: semConta.id, status: "previsto" });

    console.log("C2 · partidas do mês");
    const r = await partidasDoMes(MES);
    const nossas = r.linhas.filter((l) => l.historico.includes(MARCA));
    const de = (id: string) => nossas.filter((l) => l.lancamentoId === id).map((l) => [l.evento, l.debito, l.credito, l.valorCentavos]);
    ok(JSON.stringify(de(rec.id)) === JSON.stringify([["reconhecimento", 1659, 3108, 45000], ["baixa", BANCO, 1659, 45000]]), "receita: D Clientes Diversos / C Serviços, depois D banco / C clientes");
    ok(JSON.stringify(de(aluguel.id)) === JSON.stringify([["reconhecimento", 3451, 2142, 6500], ["baixa", 2142, BANCO, 6500]]), "despesa paga: reconhecimento e baixa contra Fornecedores Diversos");
    ok(JSON.stringify(de(aberto.id)) === JSON.stringify([["reconhecimento", 3451, 2142, 2000]]), "despesa em aberto: só o reconhecimento");
    ok(
      JSON.stringify([...de(original.id), ...de(resto.id)]) === JSON.stringify([["reconhecimento", 3451, 2142, 10000], ["baixa", 2142, BANCO, 6000], ["baixa", 2142, BANCO, 4000]]),
      "parcial: o título nasce uma vez (100), as baixas somam 60 + 40",
    );
    ok(de(salario.id).length === 0 && r.fora.naoExportar >= 1, "folha CLT fica fora (o contador lança)");
    ok(nossas.filter((l) => l.evento === "transferencia").length === 1, "transferência: uma linha só por par");
    const linhaFatura = nossas.find((l) => l.evento === "baixa" && l.lancamentoId === compra1.id);
    ok(linhaFatura?.valorCentavos === 1200 && linhaFatura.debito === null && linhaFatura.credito === BANCO, "cartão: uma baixa por fatura (5 + 7), cartão sem conta fica em branco");
    ok(r.pendencias.some((p) => p.alvo === "cartao" && p.alvoId === cartao.id), "pendência do cartão sem conta contábil");
    ok(de(pendente.id).length === 1 && de(pendente.id)[0][1] === null && r.pendencias.some((p) => p.alvo === "categoria" && p.alvoId === semConta.id), "categoria sem de-para: linha em branco + pendência");

    const { extrato } = await extratoDaConta(conta.id, MES);
    const doExtrato = extrato.entradasCentavos - extrato.saidasCentavos;
    const noArquivo = movimentoDaConta(nossas, BANCO) + (r.fora.realizadoForaPorConta[conta.id] ?? 0);
    ok(noArquivo === doExtrato, `invariante: banco no arquivo + fora (${noArquivo}) = entradas − saídas do extrato (${doExtrato})`);

    console.log("C3 · exportação");
    await recusa(registrarExportacaoNoBanco(MES, "xlsx", autor.id), "mês aberto não exporta", MOTIVO_MES_ABERTO);
    await prisma.fechamentoMensal.create({ data: { ano: 2019, mes: 3, status: "fechado", responsavelId: autor.id, fechadoEm: new Date() } });
    const e = await registrarExportacaoNoBanco(MES, "csv", autor.id);
    const gravada = await prisma.exportacaoContabil.findUniqueOrThrow({ where: { id: e.id } });
    const agora = await partidasDoMes(MES);
    ok(gravada.hash === hashDasLinhas(agora.linhas) && (gravada.linhas as unknown[]).length === agora.linhas.length, "exportação registrada com as linhas e o hash do mês");

    console.log("C5 · layout do contador");
    const faltam = linhasSemConta(agora.linhas);
    ok(faltam > 0, `há linhas sem conta no mês de teste (${faltam}: cartão, categoria e a conta de destino da transferência sem de-para)`);
    await recusa(registrarExportacaoNoBanco(MES, "alterdata", autor.id), "layout do contador recusa mês com linha sem conta", MOTIVO_ALTERDATA_SEM_CONTA(faltam));
    ok((await prisma.exportacaoContabil.count({ where: { competencia: MES, formato: "alterdata" } })) === 0, "a recusa não deixa registro de exportação");

    await definirContaNoBanco("categoria", semConta.id, 3451);
    await prisma.deParaContabil.create({ data: { alvo: "cartao", alvoId: cartao.id, contaReduzido: 4221 } });
    await definirContaNoBanco("conta_bancaria", outra.id, 3402);
    const completo = await partidasDoMes(MES);
    ok(linhasSemConta(completo.linhas) === 0, "com o de-para completo não sobra linha sem conta");
    const e5 = await registrarExportacaoNoBanco(MES, "alterdata", autor.id);
    const g5 = await prisma.exportacaoContabil.findUniqueOrThrow({ where: { id: e5.id } });
    ok(g5.formato === "alterdata" && g5.pendencias === 0, "exportação do layout do contador registrada, sem pendência");
    const modelo = linhasDoAlterdata(g5.linhas as unknown as Parameters<typeof linhasDoAlterdata>[0]);
    ok(
      modelo.length === completo.linhas.length && modelo.every((l) => l.length === 8 && /^\d+(\.\d+)*$/.test(l[0]) && /^\d+(\.\d+)*$/.test(l[1]) && l[2] instanceof Date && typeof l[3] === "number" && l[4].length > 0 && l[4].length <= 200),
      "cada linha vira classificação de débito e de crédito, data, valor e complemento (até 200)",
    );
    // Centro e projeto só vão nas linhas de receita/despesa (o reconhecimento); a baixa é banco × cliente/fornecedor e não tem.
    const reconhecimentoDaReceita = modelo.filter((l) => l[4].startsWith(`${MARCA} parcela`));
    ok(
      reconhecimentoDaReceita.length === 1 && reconhecimentoDaReceita[0][5] === `${MARCA} centro`,
      "centro de custo vai na coluna extra à direita (sem de-para, sai o nome do centro no SenaHub)",
    );
    if (projeto) ok(reconhecimentoDaReceita[0]?.[6] === projeto.codigo, `projeto vai na coluna extra (código ${projeto.codigo})`);
    ok(
      reconhecimentoDaReceita[0]?.[0] === "1.1.2.01.0001" && reconhecimentoDaReceita[0]?.[1] === "4.1.1.02.0001",
      "débito e crédito saem pela classificação do plano (Clientes Diversos / Serviços Prestados)",
    );
    ok(reconhecimentoDaReceita[0]?.[7] === CHAVE && !reconhecimentoDaReceita[0][4].includes(CHAVE), "a chave da NF-e vai na coluna própria, fora do complemento");
    ok(
      modelo.filter((l) => l !== reconhecimentoDaReceita[0]).every((l) => l[5] === null && l[6] === null),
      "a baixa e as linhas sem centro nem projeto deixam as colunas extras em branco",
    );
    const somaModelo = Math.round(modelo.reduce((t, l) => t + l[3], 0) * 100);
    ok(somaModelo === completo.totalCentavos, `a soma dos valores do arquivo (${somaModelo}) fecha com o total das partidas (${completo.totalCentavos})`);

    // Classificação repetida no plano (PIS/COFINS/ICMS/IPI/IE = 2.1.3.01.0003): aceita, vêm juntos no DAS do Simples (dono, 2026-10-16).
    await definirContaNoBanco("categoria", semConta.id, 2177);
    const comRepetida = await partidasDoMes(MES);
    ok(comRepetida.linhas.some((l) => l.debitoClassificacao === "2.1.3.01.0003"), "conta de classificação repetida sai pela classificação");
    const eRepetida = await registrarExportacaoNoBanco(MES, "alterdata", autor.id);
    ok(!!eRepetida.id, "layout do contador aceita a classificação repetida (uma conta só no DAS)");
    const generico = await registrarExportacaoNoBanco(MES, "xlsx", autor.id);
    ok(!!generico.id, "o arquivo genérico também exporta");
  } finally {
    const outras = await prisma.contaBancaria.findMany({ where: { nome: { startsWith: MARCA } }, select: { id: true } });
    await limpar(ids);
    await prisma.deParaContabil.deleteMany({ where: { alvo: "conta_bancaria", alvoId: { in: outras.map((o) => o.id) } } });
    await prisma.contaBancaria.deleteMany({ where: { id: { in: outras.map((o) => o.id) } } });
  }
  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  if (falhas) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
