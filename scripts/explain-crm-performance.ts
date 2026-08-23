/** F6.11 — EXPLAIN ANALYZE das cinco leituras críticas cobertas pelos índices do CRM. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type LinhaPlano = { "QUERY PLAN": string };

async function explicar(nome: string, consulta: Promise<LinhaPlano[]>) {
  const linhas = await consulta;
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
    prisma.$queryRaw<LinhaPlano[]>`
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
    prisma.$queryRaw<LinhaPlano[]>`
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
    prisma.$queryRaw<LinhaPlano[]>`
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
    prisma.$queryRaw<LinhaPlano[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT "id", "enviadaEm"
      FROM "proposta"
      WHERE "status" = CAST(${"enviada"} AS "StatusProposta")
      ORDER BY "enviadaEm" ASC
      LIMIT 8
    `,
  );

  await explicar(
    "Inteligência — propostas de uma negociação",
    prisma.$queryRaw<LinhaPlano[]>`
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
