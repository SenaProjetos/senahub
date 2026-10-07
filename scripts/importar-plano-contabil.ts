/**
 * Importa (ou re-importa) o plano de contas do contador — integração contábil, fase C0.
 * Upsert pelo código reduzido; conta que saiu do plano vira inativa (nunca é apagada). Idempotente.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/importar-plano-contabil.ts [arquivo.csv]
 *
 * Sem argumento, usa o plano versionado em docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv.
 * Formato: `classificacao;reduzido;nome;tipo;natureza;centro_custo` (tipo A/S, natureza D/C/I, centro S/N).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { lerPlanoCsv } from "../src/modules/financeiro/contabil/plano";
import { importarPlanoNoBanco } from "../src/modules/financeiro/contabil/service";

const PADRAO = path.resolve(__dirname, "../docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv");

async function main() {
  const arquivo = path.resolve(process.argv[2] ?? PADRAO);
  const { contas, erros } = lerPlanoCsv(readFileSync(arquivo, "utf8"));
  if (erros.length) {
    for (const e of erros) console.error(`Linha ${e.linha}: ${e.motivo}`);
    console.error(`\n${erros.length} linha(s) com erro: nada foi gravado.`);
    process.exitCode = 1;
    return;
  }
  const r = await importarPlanoNoBanco(contas);
  console.log(`Plano importado de ${path.basename(arquivo)}: ${contas.length} contas lidas.`);
  console.log(`  novas: ${r.criadas} · alteradas: ${r.alteradas} · iguais: ${r.iguais} · desativadas: ${r.desativar.length}`);
  if (r.desativar.length) console.log(`  desativadas (saíram do plano): ${r.desativar.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
