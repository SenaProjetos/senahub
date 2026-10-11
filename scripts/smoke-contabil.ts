/**
 * Smoke da integração contábil (M5, fases C0–C3) contra o banco de dev. Cria um mês isolado (2019-03) com
 * uma conta bancária, um cartão e lançamentos de teste, e confere o que o vitest não alcança:
 *
 *   C0. O plano do contador importa (idempotente) e o de-para recusa conta sintética / fora do plano.
 *   C2. Partidas lidas do banco: reconhecimento + baixa, parcial nasce uma vez, cartão numa linha por fatura,
 *       transferência numa linha, folha fora (o contador lança), pendência da categoria sem conta, e a
 *       INVARIANTE: o banco no arquivo + o que ficou fora = entradas − saídas do Extrato por conta.
 *   C3. Exportar mês aberto é recusado; fechado, registra a exportação com as linhas e o hash.
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

async function limpar(ids: { conta?: string; cartao?: string; categoria?: string }) {
  await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: MARCA } } });
  if (ids.cartao) {
    await prisma.faturaCartao.deleteMany({ where: { cartaoId: ids.cartao } });
    await prisma.cartaoCredito.deleteMany({ where: { id: ids.cartao } });
  }
  if (ids.conta) {
    await prisma.deParaContabil.deleteMany({ where: { alvo: "conta_bancaria", alvoId: ids.conta } });
    await prisma.contaBancaria.deleteMany({ where: { id: ids.conta } });
  }
  if (ids.categoria) await prisma.categoriaFinanceira.deleteMany({ where: { id: ids.categoria } });
  await prisma.exportacaoContabil.deleteMany({ where: { competencia: MES } });
  await prisma.fechamentoMensal.deleteMany({ where: { ano: 2019, mes: 3 } });
}

async function main() {
  const ids: { conta?: string; cartao?: string; categoria?: string } = {};
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

    const rec = await criar({ ...base, tipo: "receita", descricao: `${MARCA} parcela`, valor: 450, categoriaId: receita, ...pago(12), numeroDocumento: "NF 3381" });
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
  } finally {
    const outras = await prisma.contaBancaria.findMany({ where: { nome: { startsWith: MARCA } }, select: { id: true } });
    await limpar(ids);
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
