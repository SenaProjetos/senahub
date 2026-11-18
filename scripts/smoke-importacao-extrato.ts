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
 *   7–9. Modo estrito recusa: transferência sem destino, paga com data futura, paga sem conta, categoria inativa.
 *   10. Duas importações simultâneas do mesmo arquivo → uma grava, a outra «Nada a importar».
 *   11. Linha excluída à mão não volta; lote desfeito volta.
 *   12. Arquivo regerado com uma linha idêntica a mais → só ela entra.
 *
 * Dados próprios com prefixo SMOKE-EXTRATO, ano 2041, limpeza no fim. Uso: npm run smoke:importacao-extrato
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ActionError } from "../src/lib/action-error";
import { executarCommit, executarDesfazer, TRAVA_IMPORTACAO } from "../src/modules/financeiro/importacao/commit-core";
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
// O smoke importa em 2041: sem isto o modo estrito recusaria tudo como "paga com data futura".
const HOJE = "2041-12-31";

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
    const out = await executarCommit(prisma, { nomeArquivo: `${TAG}.csv`, mapeamento: MAPA, res, autorId, criarCadastros: false, hoje: HOJE });
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
    const re = await erroDe(executarCommit(prisma, { nomeArquivo: `${TAG}-de-novo.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivo, MAPA), autorId, criarCadastros: false, hoje: HOJE }));
    check("reimportar não cria nada", re?.includes("Nada a importar") === true, re);
    check(
      "«Nada a importar» é ActionError (a action não embrulha erro técnico)",
      await erroDeNegocio(
        executarCommit(prisma, { nomeArquivo: `${TAG}-de-novo-2.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivo, MAPA), autorId, criarCadastros: false, hoje: HOJE }),
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
    const reAntigo = await erroDe(executarCommit(prisma, { nomeArquivo: `${TAG}-antigo-de-novo.csv`, mapeamento: MAPA, res: antiga, autorId, criarCadastros: false, hoje: HOJE }));
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
      hoje: HOJE,
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
      hoje: HOJE,
    }));
    check("modo estrito: contato novo sem documento recusa a linha", estrito?.includes("Nada a importar") === true && (await prisma.fornecedor.count({ where: { nome: `${TAG} Outro sem doc` } })) === 0, estrito);
    console.log("\n# 7 — transferência sem conta de destino (modo estrito)");
    const semDestino = await erroDe(executarCommit(prisma, {
      nomeArquivo: `${TAG}-sem-destino.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "transf sem destino", valor: "-70", tipo: "Transferência", conta: banco.nome })], MAPA),
      autorId,
      criarCadastros: false,
      hoje: HOJE,
    }));
    check(
      "transferência sem destino não grava perna solta",
      semDestino?.includes("Nada a importar") === true && (await prisma.lancamento.count({ where: { descricao: `${TAG} transf sem destino` } })) === 0,
      semDestino,
    );

    console.log("\n# 8 — linha paga com data futura e linha paga sem conta (modo estrito)");
    const futura = await erroDe(executarCommit(prisma, {
      nomeArquivo: `${TAG}-futura.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "ano errado", valor: "-12", categoria: catDesp.codigo, conta: banco.nome })], MAPA),
      autorId,
      criarCadastros: false,
      hoje: "2040-12-31",
    }));
    check("linha paga depois de hoje é recusada", futura?.includes("Nada a importar") === true, futura);
    const semConta = await erroDe(executarCommit(prisma, {
      nomeArquivo: `${TAG}-sem-conta.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "paga sem conta", valor: "-13", categoria: catDesp.codigo })], MAPA),
      autorId,
      criarCadastros: false,
      hoje: HOJE,
    }));
    check("linha paga sem conta é recusada", semConta?.includes("Nada a importar") === true, semConta);

    console.log("\n# 9 — cadastro inativo (modo estrito)");
    await prisma.categoriaFinanceira.update({ where: { id: catRec.id }, data: { ativo: false } });
    const inativa = await erroDe(executarCommit(prisma, {
      nomeArquivo: `${TAG}-inativa.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "categoria inativa", valor: "40", categoria: catRec.codigo, conta: banco.nome })], MAPA),
      autorId,
      criarCadastros: false,
      hoje: HOJE,
    }));
    await prisma.categoriaFinanceira.update({ where: { id: catRec.id }, data: { ativo: true } });
    check("categoria inativa é recusada", inativa?.includes("Nada a importar") === true, inativa);

    console.log("\n# 10 — duas importações do mesmo arquivo ao mesmo tempo");
    const arquivoCorrida = [
      linha({ descricao: "corrida a", valor: "-21", categoria: catDesp.codigo, conta: banco.nome, numDoc: "9001" }),
      linha({ descricao: "corrida b", valor: "-22", categoria: catDesp.codigo, conta: banco.nome, numDoc: "9002" }),
    ];
    const corrida = await Promise.allSettled(
      [1, 2].map((n) =>
        executarCommit(prisma, { nomeArquivo: `${TAG}-corrida-${n}.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivoCorrida, MAPA), autorId, criarCadastros: false, hoje: HOJE }),
      ),
    );
    for (const c of corrida) if (c.status === "fulfilled") lotes.push(c.value.loteId);
    const recusada = corrida.find((c) => c.status === "rejected");
    check(
      "uma grava, a outra recebe «Nada a importar»",
      corrida.filter((c) => c.status === "fulfilled").length === 1 &&
        recusada?.status === "rejected" && String((recusada.reason as Error)?.message).includes("Nada a importar"),
      corrida.map((c) => (c.status === "fulfilled" ? c.value.contagens.lancamentosCriados : String(c.reason))),
    );
    check("o arquivo entrou uma vez só (2 lançamentos)", (await prisma.lancamento.count({ where: { descricao: { startsWith: `${TAG} corrida` } } })) === 2);

    // Determinístico: com a trava presa por outra transação, a importação espera; solta a trava, ela termina.
    let terminou = false;
    let soltar!: () => void;
    const presa = new Promise<void>((r) => (soltar = r));
    const dona = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TRAVA_IMPORTACAO}))`;
        await presa;
      },
      { timeout: 30000 },
    );
    await new Promise((r) => setTimeout(r, 300));
    const esperando = executarCommit(prisma, {
      nomeArquivo: `${TAG}-fila.csv`,
      mapeamento: MAPA,
      res: normalizarLinhas([linha({ descricao: "fila", valor: "-23", categoria: catDesp.codigo, conta: banco.nome })], MAPA),
      autorId,
      criarCadastros: false,
      hoje: HOJE,
    }).then((o) => {
      terminou = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 1500));
    check("com a trava presa, a importação espera", terminou === false);
    soltar();
    await dona;
    lotes.push((await esperando).loteId);
    check("solta a trava, a importação grava", (await prisma.lancamento.count({ where: { descricao: `${TAG} fila` } })) === 1);

    console.log("\n# 11 — excluído à mão não volta; lote desfeito volta");
    const arquivoVolta = [
      linha({ descricao: "volta a", valor: "-31", categoria: catDesp.codigo, conta: banco.nome, numDoc: "9101" }),
      linha({ descricao: "volta b", valor: "-32", categoria: catDesp.codigo, conta: banco.nome, numDoc: "9102" }),
    ];
    const reimportar = (nome: string) =>
      executarCommit(prisma, { nomeArquivo: `${TAG}-${nome}.csv`, mapeamento: MAPA, res: normalizarLinhas(arquivoVolta, MAPA), autorId, criarCadastros: false, hoje: HOJE });
    const volta1 = await reimportar("volta-1");
    lotes.push(volta1.loteId);
    const voltaA = await prisma.lancamento.findFirstOrThrow({ where: { importLoteId: volta1.loteId, descricao: `${TAG} volta a` }, select: { id: true } });
    await prisma.lancamento.update({ where: { id: voltaA.id }, data: { excluidoEm: new Date() } });
    const aposExcluir = await erroDe(reimportar("volta-2"));
    check("linha excluída à mão não é importada de novo", aposExcluir?.includes("Nada a importar") === true, aposExcluir);
    await executarDesfazer(prisma, volta1.loteId);
    const volta3 = await reimportar("volta-3");
    lotes.push(volta3.loteId);
    check("lote desfeito: reimportar recria as duas linhas", volta3.contagens.lancamentosCriados === 2, volta3.contagens);

    console.log("\n# 12 — arquivo regerado com uma linha idêntica a mais");
    const tarifa = () => linha({ descricao: "tarifa regerada", valor: "-4,50", categoria: catDesp.codigo, conta: banco.nome });
    const reg1 = await executarCommit(prisma, { nomeArquivo: `${TAG}-reg-1.csv`, mapeamento: MAPA, res: normalizarLinhas([tarifa()], MAPA), autorId, criarCadastros: false, hoje: HOJE });
    lotes.push(reg1.loteId);
    const reg2 = await executarCommit(prisma, { nomeArquivo: `${TAG}-reg-2.csv`, mapeamento: MAPA, res: normalizarLinhas([tarifa(), tarifa()], MAPA), autorId, criarCadastros: false, hoje: HOJE });
    lotes.push(reg2.loteId);
    check("só a linha a mais entra", reg2.contagens.lancamentosCriados === 1 && (await prisma.lancamento.count({ where: { descricao: `${TAG} tarifa regerada` } })) === 2, reg2.contagens);
  } finally {
    await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: TAG }, excluidoEm: { not: undefined } } });
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
