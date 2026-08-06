/**
 * Limpeza dos 6 tipos de certidão genéricos herdados do seed antigo, agora que
 * `prisma/seed.ts` semeia a lista real de 12 tipos da empresa (ver módulo
 * `certidoes`). Reatribui as certidões existentes ao tipo novo equivalente e
 * remove o tipo antigo. `ART/RRT` não tem equivalente na lista nova (não é uma
 * certidão de compliance da empresa, é documento por projeto/licitação) — só é
 * removido se não tiver nenhuma certidão vinculada; se tiver, o script para e
 * pede decisão manual em vez de inventar um destino.
 *
 * Idempotente: tipo antigo que não existe mais (já limpo) é pulado.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-certidao-tipos.ts              # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-certidao-tipos.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const MAPA: Record<string, string> = {
  "CND Federal": "Certidão Regularidade Fiscal Federal",
  "CND Estadual": "Certidão Regularidade Fiscal Estadual",
  "CND Municipal": "Certidão Regularidade Fiscal Municipal",
  FGTS: "Certidão de Regularidade do FGTS",
  Trabalhista: "Certidão Negativa de Débitos Trabalhistas",
};
const SEM_MAPA = ["ART/RRT"];

async function main() {
  const gravar = process.argv.includes("--gravar");
  console.log(gravar ? "Gravando:" : "[dry-run]:");

  for (const [antigoNome, novoNome] of Object.entries(MAPA)) {
    const antigo = await prisma.certidaoTipo.findUnique({ where: { nome: antigoNome } });
    if (!antigo) {
      console.log(`  • "${antigoNome}" — já não existe, nada a fazer.`);
      continue;
    }
    const novo = await prisma.certidaoTipo.findUnique({ where: { nome: novoNome } });
    if (!novo) {
      console.error(`  ✗ "${antigoNome}" — destino "${novoNome}" não encontrado (rode db:seed antes). Pulado.`);
      continue;
    }
    const refs = await prisma.certidao.count({ where: { tipoId: antigo.id } });
    console.log(`  • "${antigoNome}" → "${novoNome}": ${refs} certidão(ões) a reatribuir, depois exclui o tipo antigo.`);
    if (gravar) {
      if (refs > 0) await prisma.certidao.updateMany({ where: { tipoId: antigo.id }, data: { tipoId: novo.id } });
      await prisma.certidaoTipo.delete({ where: { id: antigo.id } });
    }
  }

  for (const nome of SEM_MAPA) {
    const t = await prisma.certidaoTipo.findUnique({ where: { nome } });
    if (!t) {
      console.log(`  • "${nome}" — já não existe, nada a fazer.`);
      continue;
    }
    const refs = await prisma.certidao.count({ where: { tipoId: t.id } });
    if (refs > 0) {
      console.error(`  ✗ "${nome}" — tem ${refs} certidão(ões) vinculada(s) e não tem equivalente na lista nova. NÃO removido — decida manualmente (ex.: gerenciar tipos na tela /certidoes) o que fazer com essas certidões antes de excluir o tipo.`);
      continue;
    }
    console.log(`  • "${nome}": 0 certidões vinculadas — remove direto.`);
    if (gravar) await prisma.certidaoTipo.delete({ where: { id: t.id } });
  }

  if (!gravar) console.log("\nNada gravado. Repita com --gravar.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
