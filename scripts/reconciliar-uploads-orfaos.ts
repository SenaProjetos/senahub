import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { chaveDocumento } from "../src/modules/uploads/documento";

/**
 * Reconciliação dos uploads sem documento lógico (D7 do plano da Fase 2).
 *
 * O backfill original de `documento_disciplina` (20260806120000) pegou o que existia
 * naquele momento, mas `modules/ferramentas/auto-store.ts` cria `Upload` sem nunca
 * popular `documentoId` — então todo arquivo gerado por ferramenta desde então ficou
 * fora da árvore de versões. Enquanto isso não for corrigido, esses arquivos não
 * aparecem em histórico de revisões nem podem receber apontamento ancorado.
 *
 * Usa a MESMA `chaveDocumento()` do fluxo de upload: divergir aqui criaria um pai
 * duplicado em vez de achar o existente.
 *
 * SEM `--aplicar` roda em modo relatório. Idempotente: quem já tem `documentoId` nunca
 * é tocado, e o pai é resolvido por upsert na chave única `(disciplinaId, chave)`.
 *
 * Ordem no plano: este script roda ANTES de backfill-documento-revisao.ts, senão os
 * arquivos reconciliados aqui ficariam sem revisão.
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const orfaos = await prisma.upload.findMany({
    where: { excluidoEm: null, documentoId: null },
    select: {
      id: true,
      disciplinaId: true,
      pacote: true,
      pastaId: true,
      nomeArquivo: true,
      versao: true,
      origem: true,
      createdAt: true,
      disciplina: { select: { nome: true, projeto: { select: { codigo: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("== Reconciliação de uploads sem documento lógico ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("órfãos encontrados:", orfaos.length);

  if (orfaos.length === 0) {
    console.log("Nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  const porOrigem = new Map<string, number>();
  for (const u of orfaos) porOrigem.set(u.origem, (porOrigem.get(u.origem) ?? 0) + 1);
  console.log("por origem:", JSON.stringify(Object.fromEntries(porOrigem)));
  console.log("\nprimeiros 20:");
  for (const u of orfaos.slice(0, 20)) {
    console.log(`  ${u.disciplina.projeto.codigo} | ${u.disciplina.nome} | ${u.nomeArquivo} | v${u.versao} | ${u.origem}`);
  }

  if (!APLICAR) {
    console.log("\nNada foi escrito. Revise a lista acima e rode com --aplicar.");
    await prisma.$disconnect();
    return;
  }

  const tocados: string[] = [];
  for (const u of orfaos) {
    const chave = chaveDocumento({ pacote: u.pacote, pastaId: u.pastaId, nomeArquivo: u.nomeArquivo });
    const doc = await prisma.documentoDisciplina.upsert({
      where: { disciplinaId_chave: { disciplinaId: u.disciplinaId, chave } },
      create: { disciplinaId: u.disciplinaId, chave, nomeArquivo: u.nomeArquivo },
      update: {},
      select: { id: true },
    });
    await prisma.upload.update({ where: { id: u.id }, data: { documentoId: doc.id } });
    tocados.push(u.id);
  }

  // Log dos ids tocados: é o que torna a operação reversível (basta zerar `documentoId`
  // nesta lista). Sem isso não há como desfazer sem adivinhar.
  const arquivo = `reconciliacao-orfaos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(arquivo, JSON.stringify({ quando: new Date().toISOString(), uploadIds: tocados }, null, 2), "utf8");
  console.log(`\nreconciliados: ${tocados.length} | ids gravados em ${arquivo}`);

  const sobrou = await prisma.upload.count({ where: { excluidoEm: null, documentoId: null } });
  console.log("órfãos restantes (deve ser 0):", sobrou);
  await prisma.$disconnect();
}

main();
