/**
 * Migração do status da disciplina para o calculado pelas fases (spec
 * `docs/superpowers/specs/2026-11-13-status-disciplina-pelas-fases.md`, seção 8).
 *
 * Por padrão SÓ LÊ (transação READ ONLY) e imprime, por projeto, as disciplinas cujo status mudaria — de →
 * para, com as fases — para o dono conferir. Com `--gravar`, aplica pelo MESMO `recalcularStatusDisciplina`
 * (mesma trava e mesma auditoria, motivo "migração", autor nulo). Fase não é corrigida: o que estiver
 * errado, o dono vê no relatório e corrige pela fase.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/recalcular-status-disciplinas.ts            (só lê)
 *   npx tsx --tsconfig tsconfig.server.json scripts/recalcular-status-disciplinas.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { STATUS_LABEL } from "../src/modules/projetos/status";
import {
  disciplinasComStatusDivergente,
  recalcularStatusDisciplina,
  type DivergenciaStatus,
} from "../src/modules/projetos/status-pelas-fases-service";

const gravar = process.argv.includes("--gravar");

function imprimir(lista: DivergenciaStatus[]) {
  let projeto = "";
  for (const d of lista) {
    if (d.projetoCodigo !== projeto) {
      projeto = d.projetoCodigo;
      console.log(`\nProjeto ${projeto}`);
    }
    const fases = d.fases.map((f) => `${f.sigla}=${STATUS_LABEL[f.status]}`).join(", ");
    console.log(`  ${d.disciplina}: ${STATUS_LABEL[d.de]} → ${STATUS_LABEL[d.para]}   (${fases})`);
  }
}

async function main() {
  const previa = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return disciplinasComStatusDivergente(tx);
  });
  console.log(`${previa.length} disciplina(s) com o status diferente do que as fases dizem.`);
  imprimir(previa);

  if (!gravar) {
    console.log("\nNada foi gravado. Confira a lista e rode de novo com --gravar.");
    return;
  }
  let mudou = 0;
  for (const d of previa) {
    const r = await prisma.$transaction((tx) => recalcularStatusDisciplina(tx, d.disciplinaId, { autorId: null, motivo: "migração" }));
    if (r.mudou) mudou++;
  }
  console.log(`\n${mudou} disciplina(s) gravada(s) com o status calculado pelas fases.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
