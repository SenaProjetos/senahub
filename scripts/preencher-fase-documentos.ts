import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { faseDoNomeArquivo, parsePranchaFilename } from "../src/modules/projetos/pranchas/codigo";

/**
 * Preenche a fase dos documentos que ficaram sem `faseId`.
 *
 * A coluna nasceu nula e sem backfill (M5 do plano de refatoração de Documentos), e até a
 * rota de upload passar a deduzir a fase do nome, só quem enviava com "Exige fases" ligado
 * recebia classificação. Resultado: o filtro de fase da tela V2 mostrava vazio mesmo com
 * `-BS-` no nome. Este script aplica a MESMA regra do upload (`faseDoNomeArquivo`) ao acervo.
 *
 * Catálogo resolvido POR PROJETO (fases globais + as do próprio projeto, só ativas): uma
 * sigla criada só num projeto não pode classificar documento de outro.
 *
 * SEM `--aplicar` roda em modo relatório. Idempotente: só toca `faseId IS NULL`, então
 * nunca sobrescreve fase escolhida à mão no painel do documento.
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const [docs, fases] = await Promise.all([
    prisma.documentoDisciplina.findMany({
      where: { faseId: null, substituidoPorId: null },
      select: {
        id: true,
        nomeArquivo: true,
        disciplina: { select: { projetoId: true, projeto: { select: { codigo: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pranchaCatalogo.findMany({
      where: { categoria: "fase", ativo: true },
      select: { id: true, sigla: true, projetoId: true },
    }),
  ]);

  console.log("== Preenchimento de fase dos documentos ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("documentos sem fase:", docs.length);

  const atribuicoes: { documentoId: string; faseId: string }[] = [];
  const porSigla = new Map<string, number>();
  const siglasSemCatalogo = new Map<string, number>();
  let foraDoPadrao = 0;

  for (const doc of docs) {
    const projetoId = doc.disciplina.projetoId;
    const catalogo = fases.filter((fase) => fase.projetoId === null || fase.projetoId === projetoId);
    const fase = faseDoNomeArquivo(doc.nomeArquivo, catalogo);
    if (fase) {
      atribuicoes.push({ documentoId: doc.id, faseId: fase.id });
      porSigla.set(fase.sigla, (porSigla.get(fase.sigla) ?? 0) + 1);
      continue;
    }
    // Distingue "nome no padrão, sigla que ninguém cadastrou" de "nome fora do padrão": o
    // primeiro se resolve cadastrando a fase na Lista Mestre e rodando de novo.
    const sigla = parsePranchaFilename(doc.nomeArquivo)?.fase;
    if (sigla) {
      siglasSemCatalogo.set(sigla, (siglasSemCatalogo.get(sigla) ?? 0) + 1);
    } else {
      foraDoPadrao++;
    }
  }

  console.log("classificáveis:", atribuicoes.length, JSON.stringify(Object.fromEntries(porSigla)));
  console.log("sigla fora do catálogo:", JSON.stringify(Object.fromEntries(siglasSemCatalogo)));
  console.log("nome fora do padrão (ficam sem fase):", foraDoPadrao);
  console.log("\nprimeiros 20 classificáveis:");
  const nomePorId = new Map(docs.map((d) => [d.id, `${d.disciplina.projeto.codigo} | ${d.nomeArquivo}`]));
  const siglaPorId = new Map(fases.map((f) => [f.id, f.sigla]));
  for (const a of atribuicoes.slice(0, 20)) {
    console.log(`  ${nomePorId.get(a.documentoId)} → ${siglaPorId.get(a.faseId)}`);
  }

  if (!APLICAR || atribuicoes.length === 0) {
    console.log(APLICAR ? "\nNada a fazer." : "\nNada foi escrito. Revise a lista acima e rode com --aplicar.");
    await prisma.$disconnect();
    return;
  }

  const tocados: string[] = [];
  for (const a of atribuicoes) {
    // `faseId: null` no where repete a guarda: se alguém classificou à mão entre o relatório
    // e a escrita, a escolha manual vence.
    const r = await prisma.documentoDisciplina.updateMany({
      where: { id: a.documentoId, faseId: null },
      data: { faseId: a.faseId },
    });
    if (r.count > 0) tocados.push(a.documentoId);
  }

  // Ids tocados em arquivo: é o que torna a operação reversível (basta zerar `faseId` nesta
  // lista), já que o script não passa pelo AuditLog de `defineAction`.
  const arquivo = `preencher-fase-documentos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(arquivo, JSON.stringify({ quando: new Date().toISOString(), documentoIds: tocados }, null, 2), "utf8");
  console.log(`\npreenchidos: ${tocados.length} | ids gravados em ${arquivo}`);
  await prisma.$disconnect();
}

main();
