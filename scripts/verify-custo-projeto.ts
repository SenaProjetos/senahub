/**
 * Verificação end-to-end (com ROLLBACK) da ponte custo → financeiro do P1.
 * Não persiste nada: tudo roda numa transação que sempre lança ao final.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/verify-custo-projeto.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  criarDespesaProjetistaPrevista,
  sincronizarDespesaServico,
} from "@/modules/financeiro/custo/lancamento-custo";

class Rollback extends Error {}

function check(nome: string, cond: boolean) {
  console.log(`${cond ? "✅" : "❌"} ${nome}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const autor = await tx.user.findFirst({ select: { id: true, name: true } });
      const cliente = await tx.cliente.findFirst({ select: { id: true } });
      if (!autor || !cliente) throw new Error("Precisa de ao menos 1 user e 1 cliente no banco.");

      // Projeto + disciplina temporários (rollback ao final).
      const projeto = await tx.projeto.create({
        data: {
          ano: 2099, sequencial: 9999, codigo: "999999",
          tipo: "particular", nome: "VERIFY custo", clienteId: cliente.id,
          disciplinas: { create: { nome: "Arquitetura", valor: 1000, ordem: 0 } },
        },
        include: { disciplinas: true },
      });
      const disc = projeto.disciplinas[0];

      // ── Projetista: liberar (previsto) → pagar (confirma, sem duplicar) ──
      const pag = await tx.pagamentoProjetista.create({
        data: { disciplinaId: disc.id, projetistaId: autor.id, valor: 1000, tipoProfissional: "projetista_pj", status: "pendente" },
      });
      const lancId = await criarDespesaProjetistaPrevista(tx, {
        pagamentoId: pag.id, valor: 1000, tipoProfissional: "projetista_pj",
        projetistaNome: autor.name, disciplinaNome: disc.nome,
        projetoId: projeto.id, projetoCodigo: projeto.codigo, autorId: autor.id, quando: new Date(),
      });
      const prev = await tx.lancamento.findUnique({ where: { id: lancId } });
      check("projetista: lançamento PREVISTO criado", prev?.status === "previsto" && prev?.tipo === "despesa");
      check("projetista: vínculo bidirecional", prev?.pagamentoProjetistaId === pag.id);
      check("projetista: valor correto (1000)", Number(prev?.valor) === 1000);

      // Simula pagarProjetista (branch confirmar): confirma o previsto existente.
      await tx.lancamento.update({ where: { id: lancId }, data: { status: "confirmado", dataConfirmacao: new Date() } });
      const totalProjetista = await tx.lancamento.count({ where: { pagamentoProjetistaId: pag.id, status: { not: "cancelado" } } });
      check("projetista: pagar NÃO duplica (1 lançamento)", totalProjetista === 1);

      // ── Serviço terceirizado: contratado → concluído → cancelado ──
      const servico = await tx.servicoTerceirizado.create({
        data: { projetoId: projeto.id, descricao: "Sondagem", valor: 500, status: "contratado" },
      });
      const sLanc1 = await sincronizarDespesaServico(tx, {
        servicoLancamentoId: null, valor: 500, status: "contratado", fornecedorId: null,
        descricao: "Sondagem", projetoId: projeto.id, projetoCodigo: projeto.codigo, autorId: autor.id,
      });
      const sl1 = await tx.lancamento.findUnique({ where: { id: sLanc1! } });
      check("serviço contratado: despesa PREVISTA", sl1?.status === "previsto" && Number(sl1?.valor) === 500);

      const sLanc2 = await sincronizarDespesaServico(tx, {
        servicoLancamentoId: sLanc1, valor: 500, status: "concluido", fornecedorId: null,
        descricao: "Sondagem", projetoId: projeto.id, projetoCodigo: projeto.codigo, autorId: autor.id,
      });
      const sl2 = await tx.lancamento.findUnique({ where: { id: sLanc2! } });
      check("serviço concluído: MESMO lançamento vira CONFIRMADO", sLanc2 === sLanc1 && sl2?.status === "confirmado");

      const sLanc3 = await sincronizarDespesaServico(tx, {
        servicoLancamentoId: sLanc1, valor: 500, status: "cancelado", fornecedorId: null,
        descricao: "Sondagem", projetoId: projeto.id, projetoCodigo: projeto.codigo, autorId: autor.id,
      });
      const sl3 = await tx.lancamento.findUnique({ where: { id: sLanc1! } });
      check("serviço cancelado: lançamento CANCELADO, retorno null", sLanc3 === null && sl3?.status === "cancelado");
      void servico;

      // ── Margem deve enxergar as despesas (confirmada projetista 1000) ──
      const desp = await tx.lancamento.aggregate({
        where: { projetoId: projeto.id, tipo: "despesa", status: "confirmado" }, _sum: { valor: true },
      });
      check("margem: despesa confirmada do projeto = 1000", Number(desp._sum.valor) === 1000);

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("\n↩️  Transação revertida — nenhum dado persistido.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
