import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * M9 — preenche apenas a revisão de origem pela revisão já vinculada ao upload de nascimento.
 *
 * Sem `--aplicar`, o script é somente relatório. Linhas cujo upload não tem `revisaoId`
 * permanecem nulas: não se inventa uma revisão para legado ainda não reconciliado.
 * `revisaoResolucaoId` nunca é retropreenchida, pois a resolução entre revisões só existe
 * a partir deste fluxo.
 */
const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const [pendencias, semRevisaoNoUpload, jaPreenchidas, comResolucao] = await Promise.all([
    prisma.pendencia.findMany({
      where: { revisaoOrigemId: null, excluidoEm: null },
      select: { id: true, upload: { select: { revisaoId: true } } },
    }),
    prisma.pendencia.count({ where: { revisaoOrigemId: null, upload: { revisaoId: null }, excluidoEm: null } }),
    prisma.pendencia.count({ where: { revisaoOrigemId: { not: null }, excluidoEm: null } }),
    prisma.pendencia.count({ where: { revisaoResolucaoId: { not: null }, excluidoEm: null } }),
  ]);
  const atualizaveis = pendencias.flatMap((pendencia) =>
    pendencia.upload.revisaoId ? [{ id: pendencia.id, revisaoOrigemId: pendencia.upload.revisaoId }] : [],
  );

  console.log("== Backfill M9: revisão de origem da pendência ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("pendências já preenchidas:", jaPreenchidas);
  console.log("pendências a vincular pela revisão do upload:", atualizaveis.length);
  console.log("pendências sem revisão identificável no upload:", semRevisaoNoUpload);
  console.log("pendências com revisão de resolução (não alteradas):", comResolucao);

  if (!APLICAR) {
    console.log("\nNada foi escrito. Rode de novo com --aplicar para efetivar.");
    await prisma.$disconnect();
    return;
  }

  let atualizadas = 0;
  for (const pendencia of atualizaveis) {
    const resultado = await prisma.pendencia.updateMany({
      where: { id: pendencia.id, revisaoOrigemId: null },
      data: { revisaoOrigemId: pendencia.revisaoOrigemId },
    });
    atualizadas += resultado.count;
  }
  console.log("\npendências vinculadas:", atualizadas);
  console.log("revisões de resolução alteradas:", 0);
  await prisma.$disconnect();
}

main();
