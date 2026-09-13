/**
 * Levantamento SOMENTE LEITURA da folha de projetistas (Produção) — nada é gravado.
 *
 * Responde três perguntas do plano docs/superpowers/plans/2026-09-10-folha-projetistas-refatoracao.md:
 *   1. Quais pagamentos pendentes estão com R$ 0,00 (precisam de "Corrigir valor").
 *   2. Já existe lançamento CONFIRMADO de R$ 0,00 gerado por pagar uma linha zerada? (F0a.4)
 *   3. Existe pagamento efetivado cujo lançamento saiu SEM conta bancária? (§7.3)
 *
 * Rodar no servidor, na pasta do sistema:
 *   npx tsx --tsconfig tsconfig.server.json scripts/levantar-folha-projetistas.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";

function linha(...partes: (string | number | null | undefined)[]) {
  console.log("  " + partes.map((p) => p ?? "—").join(" · "));
}

async function main() {
  const [total, porStatus] = await Promise.all([
    prisma.pagamentoProjetista.count(),
    prisma.pagamentoProjetista.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  console.log(`\nPagamentos de projetistas: ${total}`);
  for (const s of porStatus) linha(s.status, s._count._all);

  // 1. Pendentes zerados
  const zerados = await prisma.pagamentoProjetista.findMany({
    where: { status: "pendente", valor: { lte: 0 } },
    orderBy: { liberadoEm: "asc" },
    select: {
      id: true,
      liberadoEm: true,
      projetista: { select: { name: true } },
      disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true } } } },
    },
  });
  console.log(`\n1. Pendentes com R$ 0,00: ${zerados.length}`);
  for (const p of zerados) {
    linha(
      p.projetista.name,
      p.disciplina.disciplinaTextoLegado,
      formatarCodigo(p.disciplina.projeto.codigo),
      `liberado ${p.liberadoEm.toISOString().slice(0, 10)}`,
      p.id,
    );
  }

  // 2 e 3 olham o lançamento vinculado ao pagamento (Lancamento.pagamentoProjetistaId).
  const base = { pagamentoProjetistaId: { not: null }, status: "confirmado" as const };

  const confirmadosZerados = await prisma.lancamento.findMany({
    where: { ...base, valor: { lte: 0 } },
    select: { id: true, descricao: true, dataConfirmacao: true, pagamentoProjetistaId: true },
  });
  console.log(`\n2. Lançamentos CONFIRMADOS de R$ 0,00 vindos da folha: ${confirmadosZerados.length}`);
  for (const l of confirmadosZerados) {
    linha(l.descricao, l.dataConfirmacao?.toISOString().slice(0, 10), `lançamento ${l.id}`);
  }

  const semConta = await prisma.lancamento.findMany({
    where: { ...base, contaId: null },
    select: { id: true, descricao: true, valor: true, dataConfirmacao: true },
  });
  console.log(`\n3. Pagamentos efetivados SEM conta bancária no lançamento: ${semConta.length}`);
  for (const l of semConta) {
    linha(l.descricao, `R$ ${Number(l.valor).toFixed(2)}`, l.dataConfirmacao?.toISOString().slice(0, 10), `lançamento ${l.id}`);
  }

  console.log("\nNada foi alterado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
