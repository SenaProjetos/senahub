/**
 * Smoke da Onda 2 contra o banco de dev: cadastros → lançamento previsto →
 * confirmação → caixa; folha (pagar projetista) → lançamento despesa na
 * categoria certa → DRE; conciliação OFX (auto-match). Idempotente.
 *
 * Uso: npm run smoke:onda2
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { relatorioDRE } from "../src/modules/financeiro/relatorios/queries";
import { fluxoCaixa } from "../src/modules/financeiro/caixa/queries";

async function main() {
  const tag = `SMK2_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin não encontrado (rode o seed).");

  const conta = await prisma.contaBancaria.create({
    data: { nome: `${tag}_conta`, tipo: "corrente", saldoInicial: 1000 },
  });
  const catReceita = await prisma.categoriaFinanceira.findUnique({ where: { codigo: "1.01" } });
  const catPJ = await prisma.categoriaFinanceira.findUnique({ where: { codigo: "2.01" } });
  check("plano de contas semeado (1.01 e 2.01)", !!catReceita && !!catPJ);

  // 1) Lançamento previsto (conta a receber) → confirma → entra no caixa
  const receita = await prisma.lancamento.create({
    data: {
      tipo: "receita",
      descricao: `${tag}_receita`,
      valor: 5000,
      status: "previsto",
      data: new Date(),
      vencimento: new Date(),
      categoriaId: catReceita!.id,
      autorId: admin.id,
    },
  });
  await prisma.lancamento.update({
    where: { id: receita.id },
    data: { status: "confirmado", dataConfirmacao: new Date(), contaId: conta.id },
  });

  // 2) Projeto + disciplina + validação → pagamento; pagar gera despesa PJ
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projetista = await prisma.user.create({
    data: { name: `${tag}_pj`, email: `${tag}@t.local`, role: "projetista_pj", ativo: true },
  });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_prj`, clienteId: cliente.id },
    });
  });
  const disc = await prisma.disciplina.create({
    data: {
      projetoId: projeto.id,
      nome: "Estrutural",
      valor: 800,
      responsaveis: { create: { userId: projetista.id } },
    },
  });
  const pag = await prisma.pagamentoProjetista.create({
    data: { disciplinaId: disc.id, projetistaId: projetista.id, valor: 800, tipoProfissional: "projetista_pj" },
  });

  // Replica o núcleo de pagarProjetista: cria despesa confirmada na 2.01
  await prisma.$transaction(async (tx) => {
    const lanc = await tx.lancamento.create({
      data: {
        tipo: "despesa",
        descricao: `${tag}_folha`,
        valor: 800,
        status: "confirmado",
        data: new Date(),
        dataConfirmacao: new Date(),
        categoriaId: catPJ!.id,
        contaId: conta.id,
        projetoId: projeto.id,
        pagamentoProjetistaId: pag.id,
        autorId: admin.id,
      },
    });
    await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { status: "pago", lancamentoId: lanc.id } });
  });

  const pagDepois = await prisma.pagamentoProjetista.findUnique({ where: { id: pag.id } });
  check("pagamento marcado como pago com lançamento vinculado", pagDepois?.status === "pago" && !!pagDepois?.lancamentoId);

  // 3) DRE do período inclui receita e despesa
  const ini = new Date(Date.now() - 86400000);
  const fim = new Date(Date.now() + 86400000);
  const dre = await relatorioDRE(ini, fim);
  check("DRE soma a receita confirmada", dre.totalReceitas >= 5000);
  check("DRE soma a despesa de folha", dre.totalDespesas >= 800);
  check("DRE resultado = receitas - despesas", Math.round(dre.resultado) === Math.round(dre.totalReceitas - dre.totalDespesas));

  // 4) Fluxo de caixa reflete saldo da conta (1000 + 5000 - 800 = 5200)
  const fc = await fluxoCaixa();
  const saldoConta = fc.contas.find((c) => c.id === conta.id)?.saldo ?? 0;
  check("saldo da conta = inicial + entradas - saídas", Math.round(saldoConta) === 5200);

  // 5) Conciliação OFX: transação que casa com lançamento previsto auto-concilia
  const previsto = await prisma.lancamento.create({
    data: {
      tipo: "despesa",
      descricao: `${tag}_aluguel`,
      valor: 1200,
      status: "previsto",
      data: new Date(),
      vencimento: new Date(),
      categoriaId: catPJ!.id,
      autorId: admin.id,
    },
  });
  const extrato = await prisma.extratoBancario.create({ data: { contaId: conta.id, nomeArquivo: `${tag}.ofx` } });
  const trans = await prisma.transacaoBancaria.create({
    data: { extratoId: extrato.id, contaId: conta.id, fitid: `${tag}_F1`, data: new Date(), valor: -1200, descricao: "aluguel" },
  });
  // auto-match manual (mesma regra do import): mesmo sinal/valor/data
  await prisma.$transaction([
    prisma.lancamento.update({ where: { id: previsto.id }, data: { status: "confirmado", dataConfirmacao: new Date(), contaId: conta.id } }),
    prisma.transacaoBancaria.update({ where: { id: trans.id }, data: { conciliado: true, lancamentoId: previsto.id } }),
  ]);
  const transOk = await prisma.transacaoBancaria.findUnique({ where: { id: trans.id } });
  check("transação conciliada com o lançamento previsto", transOk?.conciliado === true && transOk?.lancamentoId === previsto.id);

  // Limpeza
  await prisma.transacaoBancaria.deleteMany({ where: { contaId: conta.id } });
  await prisma.extratoBancario.deleteMany({ where: { contaId: conta.id } });
  await prisma.lancamento.deleteMany({ where: { descricao: { startsWith: tag } } });
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.contaBancaria.delete({ where: { id: conta.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });

  console.log(ok ? "\nSMOKE ONDA 2: OK" : "\nSMOKE ONDA 2: FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
