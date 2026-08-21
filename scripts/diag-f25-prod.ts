/**
 * Diagnóstico do estado da F2.5 em produção depois da falha P3018 (2026-08-21).
 * Somente leitura. Responde duas perguntas: os índices existem? e quem colide?
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

(async () => {
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename='lead' AND indexname LIKE 'lead_prospeccao%'`,
  );
  console.log(`Indices da F2.5 existentes: ${idx.length}`);
  for (const i of idx) console.log(`   ${i.indexname}`);
  if (idx.length === 0) console.log("   (nenhum — a migration foi marcada aplicada sem criar nada)");

  const mig = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     WHERE migration_name LIKE '%prospeccao_ativa%'`,
  );
  console.log(`\n_prisma_migrations:`, mig);

  const dup = await prisma.$queryRawUnsafe<
    { clienteId: string; nome: string; n: bigint; leads: string }[]
  >(
    `SELECT l."clienteId", c.nome, count(*) AS n,
            string_agg(l.id || ' [' || l.status || '] ' || coalesce(l.nome,''), ' | ') AS leads
     FROM lead l JOIN cliente c ON c.id = l."clienteId"
     WHERE l."excluidoEm" IS NULL AND l."clienteId" IS NOT NULL AND l."campaignId" IS NULL
       AND l.status IN ('IDENTIFICADO','CONTATO_INICIADO','EM_CONTATO','QUALIFICADO')
     GROUP BY 1,2 HAVING count(*) > 1`,
  );
  console.log(`\nEmpresas com mais de uma prospeccao ativa sem campanha: ${dup.length}`);
  for (const d of dup) console.log(`   ${d.nome} (${Number(d.n)}): ${d.leads}`);

  const total = await prisma.lead.count();
  const comCliente = await prisma.lead.count({ where: { NOT: { clienteId: null } } });
  console.log(`\nlead total=${total}, com clienteId=${comCliente}`);
  await prisma.$disconnect();
})();
