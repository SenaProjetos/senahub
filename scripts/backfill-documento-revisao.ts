import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Backfill de `DocumentoRevisao` + `Upload.revisaoId` (M2 da Fase 2).
 *
 * Toda linha de `upload` que já pertence a um documento lógico ganha a revisão
 * correspondente ao seu `versao`. Uploads que dividem `(documentoId, versao)` — PDF e DWG
 * enviados como a mesma versão do mesmo documento — passam a apontar para a MESMA revisão,
 * que é o ponto de toda a mudança.
 *
 * SEM `--aplicar` roda em modo relatório: não escreve nada, só conta o que faria. É assim
 * que se olha o estrago antes de causá-lo.
 *
 * Idempotente: quem já tem `revisaoId` é ignorado, e a revisão é criada por
 * `(documentoId, numero)` com UNIQUE no banco — rodar duas vezes não duplica.
 *
 * NÃO cobre upload com `documentoId` nulo (gap do auto-store.ts, D7): esses são assunto do
 * script de reconciliação, que roda ANTES deste. Aqui eles são só contados e relatados.
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const semDocumento = await prisma.upload.count({ where: { excluidoEm: null, documentoId: null } });
  const jaComRevisao = await prisma.upload.count({ where: { excluidoEm: null, revisaoId: { not: null } } });

  const pendentes = await prisma.upload.findMany({
    where: { excluidoEm: null, documentoId: { not: null }, revisaoId: null },
    select: { id: true, documentoId: true, versao: true, autorId: true, createdAt: true },
    orderBy: [{ documentoId: "asc" }, { versao: "asc" }, { createdAt: "asc" }],
  });

  // Agrupa por (documentoId, versao): é exatamente a chave da revisão.
  const grupos = new Map<string, { documentoId: string; numero: number; uploadIds: string[]; autorId: string; createdAt: Date }>();
  for (const u of pendentes) {
    const chave = u.documentoId + "::" + u.versao;
    const g = grupos.get(chave);
    if (g) {
      g.uploadIds.push(u.id);
      // A revisão herda o autor/data do arquivo MAIS ANTIGO do grupo (quem abriu a revisão).
      if (u.createdAt < g.createdAt) {
        g.createdAt = u.createdAt;
        g.autorId = u.autorId;
      }
    } else {
      grupos.set(chave, {
        documentoId: u.documentoId as string,
        numero: u.versao,
        uploadIds: [u.id],
        autorId: u.autorId,
        createdAt: u.createdAt,
      });
    }
  }

  const multiArquivo = [...grupos.values()].filter((g) => g.uploadIds.length > 1);

  console.log("== Backfill de revisões ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("uploads sem documento lógico (fora do escopo, ver reconciliação):", semDocumento);
  console.log("uploads que já tinham revisão (ignorados):", jaComRevisao);
  console.log("uploads a vincular:", pendentes.length);
  console.log("revisões a criar:", grupos.size);
  console.log("  dessas, com mais de um arquivo na mesma revisão:", multiArquivo.length);
  for (const g of multiArquivo.slice(0, 10)) {
    console.log(`    doc ${g.documentoId} R${String(g.numero).padStart(2, "0")} → ${g.uploadIds.length} arquivos`);
  }

  if (!APLICAR) {
    console.log("\nNada foi escrito. Rode de novo com --aplicar para efetivar.");
    await prisma.$disconnect();
    return;
  }

  let criadas = 0;
  let vinculados = 0;
  for (const g of grupos.values()) {
    const autorExiste = await prisma.user.findUnique({ where: { id: g.autorId }, select: { id: true } });
    const rev = await prisma.documentoRevisao.upsert({
      where: { documentoId_numero: { documentoId: g.documentoId, numero: g.numero } },
      create: {
        documentoId: g.documentoId,
        numero: g.numero,
        createdAt: g.createdAt,
        createdById: autorExiste ? g.autorId : null,
      },
      update: {},
      select: { id: true },
    });
    criadas += 1;
    const r = await prisma.upload.updateMany({
      where: { id: { in: g.uploadIds }, revisaoId: null },
      data: { revisaoId: rev.id },
    });
    vinculados += r.count;
  }
  console.log(`\nrevisões garantidas: ${criadas} | uploads vinculados: ${vinculados}`);

  const sobrou = await prisma.upload.count({
    where: { excluidoEm: null, documentoId: { not: null }, revisaoId: null },
  });
  console.log("uploads com documento mas ainda sem revisão (deve ser 0):", sobrou);
  await prisma.$disconnect();
}

main();
