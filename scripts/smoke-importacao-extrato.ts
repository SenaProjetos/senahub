/**
 * Smoke da importação de extrato do banco já categorizado (lançamento retroativo, plano 2026-11-10)
 * contra o banco de dev. Chama `normalizarLinhas` + `executarCommit` direto, sem sessão:
 *
 *   1. Extrato com projeto, sócio, nº do documento e uma transferência → lançamentos com projetoId,
 *      socioId, numeroDocumento e as duas pernas com o mesmo transferenciaId.
 *   2. Modo estrito com uma categoria inexistente → essa linha não entra, as outras entram, nenhuma
 *      categoria nova no plano.
 *   3. Reimportar o mesmo arquivo → nada novo (erro "Nada a importar").
 *   4. Lote antigo (importHash no formato antigo) → a linha não entra de novo.
 *   5. Linha "Saldo inicial" com data → ContaBancaria.saldoInicialEm = 2041-01-01; conta inexistente
 *      no modo estrito não é criada.
 *   6. criarCadastros: true com fornecedor sem documento → fornecedor criado (comportamento antigo).
 *
 * Dados próprios com prefixo SMOKE-EXTRATO, ano 2041, limpeza no fim. Uso: npm run smoke:importacao-extrato
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ActionError } from "../src/lib/action-error";
import { executarCommit } from "../src/modules/financeiro/importacao/commit-core";
import { normalizarLinhas, type Mapeamento } from "../src/modules/financeiro/importacao/processar";
import { categoriaDeTransferencia } from "../src/modules/financeiro/transferencias/service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

/** O erro é de negócio (ActionError), seguro para a tela — não um erro técnico mascarado. */
async function erroDeNegocio(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof ActionError;
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

const TAG = `SMOKE-EXTRATO ${Date.now()}`;
const SUF = `${Date.now()}`.slice(-6);

// Data, Descrição, Valor, Tipo, Status, Data efetiva, Categoria, Subcategoria, Conta, Conta destino,
// Contato, CPF/CNPJ, Projeto, Sócio, Nº documento
const MAPA: Mapeamento = {
  data: 0,
  descricao: 1,
  valor: 2,
  tipo: 3,
  status: 4,
  dataConfirmacao: 5,
  categoria: 6,
  subcategoria: 7,
  conta: 8,
  contaTransferencia: 9,
  contato: 10,
  documento: 11,
  projeto: 12,
  socio: 13,
  numeroDocumento: 14,
};

type Linha = Partial<{
  data: string; descricao: string; valor: string; tipo: string; categoria: string; conta: string; destino: string;
  contato: string; doc: string; projeto: string; socio: string; numDoc: string;
}>;

function linha(l: Linha): string[] {
  const data = l.data ?? "05/01/2041";
  return [
    data, `${TAG} ${l.descricao ?? "linha"}`, l.valor ?? "-10", l.tipo ?? "", "Pago", data, l.categoria ?? "", "",
    l.conta ?? "", l.destino ?? "", l.contato ?? "", l.doc ?? "", l.projeto ?? "", l.socio ?? "", l.numDoc ?? "",
  ];
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");
  const autorId = admin.id;

  const catDesp = await prisma.categoriaFinanceira.create({ data: { codigo: `SMX-D${SUF}`, nome: `${TAG} Despesas`, tipo: "despesa" } });
  const catRec = await prisma.categoriaFinanceira.create({ data: { codigo: `SMX-R${SUF}`, nome: `${TAG} Receitas`, tipo: "receita" } });
  const banco = await prisma.contaBancaria.create({ data: { nome: `${TAG} Banco`, tipo: "corrente", saldoInicial: 0 } });
  const outra = await prisma.contaBancaria.create({ data: { nome: `${TAG} Outra`, tipo: "corrente", saldoInicial: 0 } });
  const cliente = await prisma.cliente.create({ data: { nome: `${TAG} cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `SX${SUF}`, ano: 2041, sequencial: Number(SUF), nome: `${TAG} projeto`, clienteId: cliente.id },
  });
  const userSocio = await prisma.user.create({
    data: { name: `Smokextrato Henrique Sena ${SUF}`, email: `smoke-extrato-${SUF}@teste.local`, tipo: "interno", emailVerified: false },
  });
  // Inativo de propósito: o importador aceita sócio ativo ou inativo, e o smoke não mexe na divisão de lucros.
  const socio = await prisma.socio.create({ data: { userId: userSocio.id, percentual: 0, ativo: false } });

  const lotes: string[] = [];
  try {
    // A transferência usa a categoria do sistema (natureza transferência); num banco que ainda não tem uma, a
    // primeira transferência a cria — de propósito, não é cadastro lixo. Garantida antes da contagem.
    await categoriaDeTransferencia(prisma, "despesa");
    await categoriaDeTransferencia(prisma, "receita");
    const categoriasAntes = await prisma.categoriaFinanceira.count();
    const contasAntes = await prisma.contaBancaria.count();

    const arquivo = [
      linha({ data: "01/01/2041", descricao: "saldo", valor: "1000", tipo: "Saldo inicial", conta: banco.nome }),
      linha({ data: "01/01/2041", descricao: "saldo fantasma", valor: "50", tipo: "Saldo inicial", conta: `${TAG} Conta que não existe` }),
      linha({ descricao: "pix projetista", valor: "-1500,00", categoria: catDesp.codigo, conta: banco.nome, projeto: projeto.codigo.toLowerCase(), numDoc: "15342466" }),
      linha({ descricao: "reembolso socio", valor: "-200", categoria: catDesp.nome, conta: banco.nome, socio: "SMOKEXTRATO HENRIQUE SE" }),
      linha({ descricao: "recebimento", valor: "3000", categoria: catRec.codigo, conta: banco.nome }),
      linha({ descricao: "transferencia", valor: "-400", tipo: "Transferência", conta: banco.nome, destino: outra.nome }),
      linha({ descricao: "tarifa", valor: "-9,90", categoria: catDesp.codigo, conta: banco.nome }),
      linha({ descricao: "tarifa", valor: "-9,90", categoria: catDesp.codigo, conta: banco.nome }),
      linha({ descricao: "categoria inexistente", valor: "-77", categoria: `${TAG} Software`, conta: banco.nome }),
    ];
    const res = normalizarLinhas(arquivo, MAPA);
    const out = await executarCommit(prisma, { nomeArquivo: `${TAG}.csv`, mapeamento: MAPA, res, autorId, criarCadastros: false });
    lotes.push(out.loteId);
    const lancs = await prisma.lancamento.findMany({
      where: { importLoteId: out.loteId },
      select: { descricao: true, projetoId: true, socioId: true, numeroDocumento: true, transferenciaId: true, tipo: true, contaId: true, categoriaId: true },
    });
    const por = (s: string) => lancs.filter((l) => l.descricao === `${TAG} ${s}`);

    console.log("\n# 1 — colunas novas e transferência");
    check("projeto pelo código (sem diferenciar caixa)", por("pix projetista")[0]?.projetoId === projeto.id, por("pix projetista"));
    check("nº do documento gravado", por("pix projetista")[0]?.numeroDocumento === "15342466");
    check("sócio pelo nome truncado do banco", por("reembolso socio")[0]?.socioId === socio.id, por("reembolso socio"));
    const pernas = por("transferencia");
    check(
      "transferência: duas pernas com o mesmo transferenciaId",
      pernas.length === 2 && pernas[0].transferenciaId != null && pernas[0].transferenciaId === pernas[1].transferenciaId,
      pernas,
    );
    check("transferência: uma perna em cada conta", new Set(pernas.map((p) => p.contaId)).size === 2 && pernas.some((p) => p.contaId === outra.id));
    check("duas tarifas idênticas no mesmo arquivo viram dois lançamentos", por("tarifa").length === 2, por("tarifa").length);

    console.log("\n# 2 — modo estrito");
    check("linha com categoria inexistente não entra", por("categoria inexistente").length === 0);
    check("as outras linhas entram (7 lançamentos)", out.contagens.lancamentosCriados === 7, out.contagens);
    const categoriasDepois = await prisma.categoriaFinanceira.count();
    check("nenhuma categoria nova no plano", categoriasDepois === categoriasAntes, { categoriasAntes, categoriasDepois });
    check("nenhuma conta nova (saldo de conta inexistente recusado)", (await prisma.contaBancaria.count()) === contasAntes);

    console.log("\n# 3 — reimportar o mesmo arquivo");
    const re = await erroDe(executarCommit(prisma, { nomeArquivo: `${TAG}-de-novo.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivo, MAPA), autorId, criarCadastros: false }));
    check("reimportar não cria nada", re?.includes("Nada a importar") === true, re);
    check(
      "«Nada a importar» é ActionError (a action não embrulha erro técnico)",
      await erroDeNegocio(
        executarCommit(prisma, { nomeArquivo: `${TAG}-de-novo-2.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivo, MAPA), autorId, criarCadastros: false }),
      ),
    );
    check("continua com 7 lançamentos do arquivo", (await prisma.lancamento.count({ where: { descricao: { startsWith: TAG }, importLoteId: { not: null } } })) === 7);

    console.log("\n# 4 — lote no formato antigo");
    const antiga = normalizarLinhas([linha({ descricao: "lote antigo", valor: "-55", categoria: catDesp.codigo, conta: banco.nome })], MAPA);
    const loteAntigo = await prisma.importacaoFinanceira.create({ data: { nomeArquivo: `${TAG}-antigo.csv`, totalLinhas: 1, mapeamento: {}, autorId } });
    lotes.push(loteAntigo.id);
    await prisma.lancamento.create({
      data: {
        tipo: "despesa", descricao: `${TAG} lote antigo`, valor: 55, status: "confirmado", data: new Date("2041-01-05T00:00:00Z"),
        dataConfirmacao: new Date("2041-01-05T00:00:00Z"), categoriaId: catDesp.id, contaId: banco.id,
        importLoteId: loteAntigo.id, importHash: antiga.linhas[0].hashLegado, autorId,
      },
    });
    const reAntigo = await erroDe(executarCommit(prisma, { nomeArquivo: `${TAG}-antigo-de-novo.csv`, mapeamento: MAPA, res: antiga, autorId, criarCadastros: false }));
    check("linha já gravada com hash antigo não entra de novo", reAntigo?.includes("Nada a importar") === true, reAntigo);

    console.log("\n# 5 — saldo inicial com data");
    const contaDepois = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: banco.id }, select: { saldoInicial: true, saldoInicialEm: true } });
    check("saldoInicial gravado", Number(contaDepois.saldoInicial) === 1000, contaDepois);
    check("saldoInicialEm = 2041-01-01", contaDepois.saldoInicialEm?.toISOString().slice(0, 10) === "2041-01-01", contaDepois);

    console.log("\n# 5b — arquivo só com saldo inicial");
    const soSaldo = await executarCommit(prisma, {
      nomeArquivo: `${TAG}-saldo.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ data: "01/02/2041", descricao: "saldo fev", valor: "2000", tipo: "Saldo inicial", conta: banco.nome })], MAPA),
      autorId,
      criarCadastros: false,
    }).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    if (typeof soSaldo !== "string") lotes.push(soSaldo.loteId);
    const contaSaldo = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: banco.id }, select: { saldoInicial: true, saldoInicialEm: true } });
    check(
      "arquivo só com «Saldo inicial» grava o saldo e a data",
      typeof soSaldo !== "string" &&
        soSaldo.saldosIniciais === 1 &&
        Number(contaSaldo.saldoInicial) === 2000 &&
        contaSaldo.saldoInicialEm?.toISOString().slice(0, 10) === "2041-02-01",
      { soSaldo, contaSaldo },
    );

    console.log("\n# 6 — criarCadastros: true (migração do Meu Dinheiro)");
    const fornNome = `${TAG} Fornecedor sem doc`;
    const criar = await executarCommit(prisma, {
      nomeArquivo: `${TAG}-criar.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "compra", valor: "-30", categoria: catDesp.nome, conta: banco.nome, contato: fornNome })], MAPA),
      autorId,
      criarCadastros: true,
    });
    lotes.push(criar.loteId);
    check("fornecedor sem documento criado", (await prisma.fornecedor.count({ where: { nome: fornNome } })) === 1 && criar.contagens.fornecedoresCriados === 1, criar.contagens);
    const estrito = await erroDe(executarCommit(prisma, {
      nomeArquivo: `${TAG}-estrito.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "compra 2", valor: "-31", categoria: catDesp.nome, conta: banco.nome, contato: `${TAG} Outro sem doc` })], MAPA),
      autorId,
      criarCadastros: false,
    }));
    check("modo estrito: contato novo sem documento recusa a linha", estrito?.includes("Nada a importar") === true && (await prisma.fornecedor.count({ where: { nome: `${TAG} Outro sem doc` } })) === 0, estrito);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: TAG } } });
    // Pelo nome do arquivo também: um commit que deveria ter sido recusado e passou deixaria o lote fora de `lotes`.
    await prisma.importacaoFinanceira.deleteMany({ where: { OR: [{ id: { in: lotes } }, { nomeArquivo: { startsWith: TAG } }] } });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: TAG } } });
    await prisma.socio.delete({ where: { id: socio.id } });
    await prisma.user.delete({ where: { id: userSocio.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.contaBancaria.deleteMany({ where: { nome: { startsWith: TAG } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: TAG } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
