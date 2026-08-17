import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Diagnóstico somente-leitura do estado da Fase 2 no banco (rodar em produção após deploy).
 * Não escreve nada. Diz o que já rodou e o que ainda falta.
 */
async function main() {
  const [docs, vivos, apelidos, revs, ups, semRev, orfaos, status] = await Promise.all([
    prisma.documentoDisciplina.count(),
    prisma.documentoDisciplina.count({ where: { substituidoPorId: null } }),
    prisma.documentoDisciplina.count({ where: { substituidoPorId: { not: null } } }),
    prisma.documentoRevisao.count(),
    prisma.upload.count({ where: { excluidoEm: null } }),
    prisma.upload.count({ where: { excluidoEm: null, documentoId: { not: null }, revisaoId: null } }),
    prisma.upload.count({ where: { excluidoEm: null, documentoId: null } }),
    prisma.documentoStatus.count(),
  ]);
  const todas = await prisma.documentoRevisao.findMany({ select: { uploads: { select: { id: true } } } });
  const multi = todas.filter((r) => r.uploads.length > 1).length;

  console.log("=== ESTADO DA FASE 2 ===");
  console.log(`documentos: ${docs} (vivos ${vivos} / apelidos ${apelidos})`);
  console.log(`revisoes: ${revs} | com mais de um arquivo: ${multi}`);
  console.log(`uploads ativos: ${ups} | sem revisao: ${semRev} | orfaos: ${orfaos}`);
  console.log(`catalogo de status: ${status}`);

  console.log("\n=== O QUE FALTA ===");
  const pend: string[] = [];
  if (status === 0) pend.push("npm run db:seed  (catalogo de status vazio)");
  if (orfaos > 0) pend.push(`scripts/reconciliar-uploads-orfaos.ts  (${orfaos} orfaos)`);
  if (semRev > 0) pend.push(`scripts/backfill-documento-revisao.ts  (${semRev} uploads sem revisao)`);
  if (apelidos === 0 && multi === 0) pend.push("scripts/merge-documentos-por-base.ts  (nenhum documento mesclado)");
  if (pend.length === 0) console.log("  nada — Fase 2 aplicada por completo.");
  else pend.forEach((p) => console.log("  - " + p));
  await prisma.$disconnect();
}
main();
