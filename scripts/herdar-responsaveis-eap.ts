/**
 * Herança do responsável da disciplina para as linhas de EAP que JÁ EXISTIAM antes da F5
 * (D22). Spec: `docs/superpowers/specs/2026-09-23-planejamento-motor-cronograma.md`.
 *
 * RODAR UMA VEZ, NO DEPLOY DA F5, junto com a migration 20260924160000:
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/herdar-responsaveis-eap.ts            (simula)
 *   npx tsx --tsconfig tsconfig.server.json scripts/herdar-responsaveis-eap.ts --gravar   (grava)
 *
 * Por que existe: até a F5 o verificador de qualidade LIA o responsável da disciplina
 * como se fosse o da linha. A partir da F5 ele lê as atribuições da linha — sem este
 * script, toda linha antiga aparece "sem responsável" e a Saúde de todo projeto cai no dia
 * do deploy (e a foto diária grava a queda como se fosse real).
 *
 * Por que é SCRIPT e não SQL na migration: usa a MESMA regra pura (`herdarResponsaveis`)
 * que a aplicação usa ao criar linha — em SQL seria uma segunda implementação, que diverge
 * na primeira mudança de regra.
 *
 * Por que UMA VEZ: preenche toda linha executável SEM NINGUÉM. Hoje isso é exatamente "linha
 * de antes da F5". Depois do deploy, linha sem ninguém pode ser escolha do coordenador —
 * rodar de novo desfaria a escolha. Para preencher linhas vazias depois, use o botão na
 * tela do cronograma, que é por projeto e à vista de quem decide.
 *
 * Idempotente dentro da mesma rodada: linha que já tem atribuição não é tocada.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { herdarResponsaveisNoProjeto } from "../src/modules/planejamento/recursos-service";

const gravar = process.argv.includes("--gravar");

class Simulacao extends Error {}

async function main() {
  const projetos = await prisma.eapTarefa.groupBy({ by: ["projetoId"] });
  let total = 0;
  let comHeranca = 0;
  for (const { projetoId } of projetos) {
    let n = 0;
    try {
      await prisma.$transaction(async (tx) => {
        n = await herdarResponsaveisNoProjeto(tx, projetoId);
        // Simulação: roda a mesma escrita e desfaz — o número é o que seria gravado, sem
        // uma segunda implementação "só de contagem" para divergir da real.
        if (!gravar) throw new Simulacao();
      });
    } catch (e) {
      if (!(e instanceof Simulacao)) throw e;
    }
    if (n > 0) {
      comHeranca++;
      console.log(`  ${projetoId}: ${n} atribuição(ões)`);
    }
    total += n;
  }
  console.log(
    `${gravar ? "Gravadas" : "Seriam gravadas"} ${total} atribuição(ões) em ${comHeranca} de ${projetos.length} projeto(s) com EAP.`,
  );
  if (!gravar && total > 0) console.log("Simulação. Rode com --gravar para aplicar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
