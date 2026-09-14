import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Acha TODO upload de um projeto cujo nome contenha um pedaço, em QUALQUER disciplina
 * (não só as de um link) — pra descobrir se existe disciplina duplicada/homônima
 * escondendo uma cópia lixeirada fora do alcance de um link específico.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/diag-uploads-projeto.ts <projetoIdOuCodigo> <pedacoDoNome>
 */
async function main() {
  const chave = process.argv[2];
  const filtro = process.argv[3];
  if (!chave || !filtro) {
    console.error("Uso: diag-uploads-projeto.ts <projetoId ou código> <pedaço do nome>");
    process.exit(1);
  }

  const projeto = await prisma.projeto.findFirst({
    where: { OR: [{ id: chave }, { codigo: chave }] },
    select: { id: true, codigo: true, nome: true },
  });
  if (!projeto) {
    console.log("Projeto não encontrado.");
    await prisma.$disconnect();
    return;
  }
  console.log(`Projeto: ${projeto.codigo} — ${projeto.nome} (${projeto.id})`);

  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId: projeto.id },
    select: { id: true, disciplinaTextoLegado: true },
  });
  console.log(`\n== Disciplinas do projeto (${disciplinas.length}) ==`);
  for (const d of disciplinas) console.log(`  [${d.id}] ${d.disciplinaTextoLegado}`);

  const uploads = await prisma.upload.findMany({
    where: {
      disciplina: { projetoId: projeto.id },
      nomeArquivo: { contains: filtro, mode: "insensitive" },
      // Escape hatch do filtro de soft delete (lib/prisma.ts): `{ not: undefined }` = TODOS
      // (ativos + lixeira). Sem isso a extensão injeta `excluidoEm: null` e a lixeira some.
      excluidoEm: { not: undefined },
    },
    orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
    select: {
      id: true,
      nomeArquivo: true,
      versao: true,
      tamanho: true,
      validado: true,
      excluidoEm: true,
      disciplinaId: true,
      disciplina: { select: { disciplinaTextoLegado: true } },
      createdAt: true,
      autor: { select: { name: true } },
      documentoId: true,
      revisao: { select: { numero: true } },
    },
  });
  console.log(`\n== Uploads com "${filtro}" no nome (${uploads.length}) ==`);
  for (const u of uploads) {
    console.log(
      `  [${u.id}] ${u.nomeArquivo}  v${u.versao}  ${u.tamanho}B  disc=${u.disciplina.disciplinaTextoLegado}  validado=${u.validado}  LIXEIRA=${u.excluidoEm ? u.excluidoEm.toISOString() : "não"}  doc=${u.documentoId ?? "null"}  rev=${u.revisao?.numero ?? "null"}  autor=${u.autor.name}  criado=${u.createdAt.toISOString()}`,
    );
  }

  await prisma.$disconnect();
}

main();
