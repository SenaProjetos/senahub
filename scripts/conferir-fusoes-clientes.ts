/**
 * Confere, SÓ LENDO, se alguma fusão de clientes deixou linhas penduradas no cliente arquivado.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/conferir-fusoes-clientes.ts
 *
 * Por que existe: até o commit 56d73573 (2026-11-03) a fusão (`modules/clientes/fusao.ts`) NÃO movia
 * negociação (fichas do funil), atividade, regra de preenchimento, próxima ação (compromisso ancorado no
 * CLIENTE) nem o de-para contábil do cliente. Uma fusão feita antes disso pode ter deixado essas linhas
 * no cliente absorvido (arquivado, `fundidoEmId` preenchido) — elas somem da ficha do sobrevivente.
 *
 * - Roda numa transação READ ONLY: o Postgres recusa qualquer escrita. Não corrige nada.
 * - Para cada cliente absorvido, conta as linhas que ainda apontam para ele, tabela por tabela, com as
 *   mesmas colunas que a fusão de hoje move. "Esperado zero" = a fusão antiga já movia; número ali indica
 *   linha criada no arquivado depois da fusão. "Não movia" = os 5 casos do bug.
 * - De-para contábil: se o sobrevivente já tem o dele, o do absorvido fica de propósito (a fusão de hoje
 *   também deixa) e o relatório só informa.
 * - Lançamento conta também os excluídos (soft delete), em coluna separada.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type Linha = { absorvidoId: string; tabela: string; qtd: bigint };

/** Tabelas que a fusão antiga JÁ movia: aqui o esperado é zero. */
const JA_MOVIA = new Set([
  "contato_cliente",
  "projeto",
  "lancamento",
  "lancamento (excluídos)",
  "documento_juridico",
  "documento",
  "lead",
  "proposta",
  "custo_orcamento",
  "user (login do portal)",
  "documento_financeiro",
  "oportunidade",
]);

async function main() {
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;

    const absorvidos = await tx.$queryRaw<
      { id: string; nome: string; fusaoEm: Date | null; sobreviventeId: string; sobreviventeNome: string | null; sobreviventeTemDePara: boolean }[]
    >`
      SELECT a.id, a.nome, a."fusaoEm", a."fundidoEmId" AS "sobreviventeId", s.nome AS "sobreviventeNome",
             EXISTS (SELECT 1 FROM de_para_contabil d WHERE d.alvo = 'cliente' AND d."alvoId" = a."fundidoEmId") AS "sobreviventeTemDePara"
      FROM cliente a
      LEFT JOIN cliente s ON s.id = a."fundidoEmId"
      WHERE a."fundidoEmId" IS NOT NULL
      ORDER BY a."fusaoEm" NULLS FIRST, a.nome
    `;

    const linhas = await tx.$queryRaw<Linha[]>`
      WITH abs AS (SELECT id FROM cliente WHERE "fundidoEmId" IS NOT NULL)
      SELECT "clienteId" AS "absorvidoId", 'negociacao' AS tabela, count(*) AS qtd FROM negociacao WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'atividade', count(*) FROM atividade WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'regra_categorizacao', count(*) FROM regra_categorizacao WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "entidadeId", 'compromisso (próxima ação)', count(*) FROM compromisso WHERE "entidadeTipo" = 'CLIENTE' AND "entidadeId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "alvoId", 'de_para_contabil', count(*) FROM de_para_contabil WHERE alvo = 'cliente' AND "alvoId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'contato_cliente', count(*) FROM contato_cliente WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'projeto', count(*) FROM projeto WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'lancamento', count(*) FROM lancamento WHERE "excluidoEm" IS NULL AND "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'lancamento (excluídos)', count(*) FROM lancamento WHERE "excluidoEm" IS NOT NULL AND "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'documento_juridico', count(*) FROM documento_juridico WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'documento', count(*) FROM documento WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'lead', count(*) FROM lead WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'proposta', count(*) FROM proposta WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "contratanteId", 'custo_orcamento', count(*) FROM custo_orcamento WHERE "contratanteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'user (login do portal)', count(*) FROM "user" WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'documento_financeiro', count(*) FROM documento_financeiro WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
      UNION ALL SELECT "clienteId", 'oportunidade', count(*) FROM oportunidade WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
    `;

    return { absorvidos, linhas };
  });

  const { absorvidos, linhas } = resultado;
  console.log(`Clientes absorvidos por fusão: ${absorvidos.length}`);
  if (absorvidos.length === 0) {
    console.log("Nenhuma fusão no banco. Nada a conferir.");
    return;
  }

  let comPendencia = 0;
  for (const a of absorvidos) {
    const minhas = linhas.filter((l) => l.absorvidoId === a.id);
    const quando = a.fusaoEm ? a.fusaoEm.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "data desconhecida";
    console.log(`\n• ${a.nome} (${a.id}) → ${a.sobreviventeNome ?? "?"} (${a.sobreviventeId}) — fusão em ${quando}`);
    if (minhas.length === 0) {
      console.log("    nada pendurado no absorvido.");
      continue;
    }
    let pendente = false;
    for (const l of minhas) {
      const qtd = Number(l.qtd);
      let nota: string;
      if (l.tabela === "de_para_contabil" && a.sobreviventeTemDePara) nota = "fica de propósito: o sobrevivente já tem o dele";
      else if (JA_MOVIA.has(l.tabela)) nota = "esperado zero: linha nova no arquivado ou fusão por outro caminho";
      else nota = "NÃO MOVIDO pela fusão antiga";
      if (!(l.tabela === "de_para_contabil" && a.sobreviventeTemDePara)) pendente = true;
      console.log(`    ${l.tabela.padEnd(28)} ${String(qtd).padStart(5)}   ${nota}`);
    }
    if (pendente) comPendencia++;
  }
  console.log(`\nResumo: ${comPendencia} de ${absorvidos.length} cliente(s) absorvido(s) com linhas a mover. Nada foi gravado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
