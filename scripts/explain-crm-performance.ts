/**
 * F6.11 — EXPLAIN ANALYZE das leituras críticas cobertas pelos índices do CRM.
 *
 * O plano é medido com `enable_seqscan = off` (só dentro da transação da consulta). O que o gate
 * responde é "existe um índice que ATENDE esta consulta?", não "o otimizador o prefere HOJE?": em
 * tabela pequena ou com uma coluna muito concentrada (30% dos leads em IDENTIFICADO, por exemplo)
 * varrer a tabela é legitimamente mais barato, e o gate reprovava sem que nada estivesse errado.
 * Sem o Seq Scan como alternativa, um índice ausente ou inadequado continua reprovando.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";

type LinhaPlano = { "QUERY PLAN": string };

async function explicar(nome: string, consulta: (tx: Prisma.TransactionClient) => Promise<LinhaPlano[]>) {
  const linhas = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return consulta(tx);
  });
  const plano = linhas.map((linha) => linha["QUERY PLAN"]).join("\n");
  const usaIndice = /(?:Index(?: Only)? Scan|Bitmap Index Scan)/.test(plano);
  const seqScan = /Seq Scan/.test(plano);
  console.log(`\n── ${nome} ──\n${plano}`);
  if (!usaIndice || seqScan) {
    throw new Error(`${nome}: plano precisa usar índice e não pode conter Seq Scan.`);
  }
}

async function main() {
  const [cliente, negociacao] = await Promise.all([
    prisma.cliente.findFirst({
      where: { nome: { startsWith: "SEED_VOL_" } },
      orderBy: { nome: "asc" },
      select: { id: true },
    }),
    prisma.negociacao.findFirst({
      where: { titulo: { startsWith: "SEED_VOL_" } },
      select: { id: true },
    }),
  ]);
  if (!cliente || !negociacao) {
    throw new Error("Fixture ausente. Rode `npm run seed:crm-volume` antes do EXPLAIN.");
  }

  await explicar(
    "Kanban de prospecção — página de IDENTIFICADO",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id"
      FROM "lead"
      WHERE "status" = CAST(${"IDENTIFICADO"} AS "StatusProspeccao")
        AND "arquivado" = false
        AND "excluidoEm" IS NULL
      ORDER BY "updatedAt" DESC
      LIMIT 25
    `,
  );

  await explicar(
    "Kanban de negociação — página de LEVANTAMENTO",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id"
      FROM "negociacao"
      WHERE "estagio" = CAST(${"LEVANTAMENTO"} AS "EstagioNegociacao")
        AND "excluidoEm" IS NULL
      ORDER BY "updatedAt" DESC
      LIMIT 25
    `,
  );

  await explicar(
    "Empresa 360 — timeline da empresa",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id", "createdAt"
      FROM "atividade"
      WHERE "clienteId" = ${cliente.id}
      ORDER BY "createdAt" DESC
      LIMIT 50
    `,
  );

  await explicar(
    "Home — propostas enviadas por data",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id", "enviadaEm"
      FROM "proposta"
      WHERE "status" = CAST(${"enviada"} AS "StatusProposta")
      ORDER BY "enviadaEm" ASC
      LIMIT 8
    `,
  );

  await explicar(
    "Follow-ups — ações comerciais em aberto por data",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id", "inicio"
      FROM "compromisso"
      WHERE "entidadeTipo" IS NOT NULL
        AND "tipo" IS NOT NULL
        AND "concluidoEm" IS NULL
      ORDER BY "inicio" ASC
      LIMIT 300
    `,
  );

  await explicar(
    "Inteligência — propostas de uma negociação",
    (tx) => tx.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id", "negociacaoId"
      FROM "proposta"
      WHERE "negociacaoId" = ${negociacao.id}
    `,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
