import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { linkVigente } from "../src/lib/link-publico";

/**
 * Diagnóstico somente-leitura de um link público de arquivos.
 *
 * A página pública mostra "0 arquivos" por quatro motivos diferentes, e de fora eles são
 * indistinguíveis: link expirado/revogado, whitelist de disciplina vazia, disciplina da
 * whitelist que não existe mais, ou simplesmente nenhum arquivo validado. Este script diz
 * qual dos quatro é.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-link-publico.ts <codigo-do-projeto>
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-link-publico.ts --token <token>
 *
 * Não escreve nada.
 */

async function main() {
  const args = process.argv.slice(2);
  const porToken = args[0] === "--token" ? args[1] : null;
  const codigo = porToken ? null : args[0];

  if (!porToken && !codigo) {
    console.log("Informe o código do projeto (ex.: 260029) ou --token <token>.");
    await prisma.$disconnect();
    return;
  }

  // Ternário com dois `include` confunde a inferência do Prisma — busca em duas etapas.
  const where = porToken ? { token: porToken } : { projeto: { codigo: codigo! } };
  const link = await prisma.linkPublicoArquivos.findFirst({
    where,
    include: { projeto: { select: { id: true, codigo: true, nome: true } } },
  });

  if (!link) {
    console.log("Nenhum link público encontrado para esse projeto/token.");
    console.log("→ Causa: o link nunca foi criado. Gere um pela aba Arquivos do projeto.");
    await prisma.$disconnect();
    return;
  }

  console.log(`=== Link público — ${link.projeto.codigo} · ${link.projeto.nome} ===`);
  console.log(`token: ${link.token.slice(0, 8)}…`);
  console.log(`ativo: ${link.ativo}`);
  console.log(`expira em: ${link.expiraEm ? link.expiraEm.toISOString() : "sem expiração"}`);
  console.log(`vigente: ${linkVigente(link)}`);
  console.log(`disciplinas na whitelist: ${link.disciplinaIds.length}`);

  if (!linkVigente(link)) {
    console.log("\n→ CAUSA: link revogado ou expirado. A página mostra 'link indisponível'.");
    await prisma.$disconnect();
    return;
  }
  if (link.disciplinaIds.length === 0) {
    console.log("\n→ CAUSA: nenhuma disciplina marcada no link. Abra o link público e selecione as disciplinas.");
    await prisma.$disconnect();
    return;
  }

  // Disciplina da whitelist que não existe mais deixa o link mudo, sem erro visível.
  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: link.disciplinaIds } },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      projetoId: true,
      _count: { select: { uploads: true } },
    },
  });
  const sumiram = link.disciplinaIds.filter((id) => !disciplinas.some((d) => d.id === id));
  if (sumiram.length > 0) {
    console.log(`\n⚠ ${sumiram.length} disciplina(s) da whitelist NÃO existem mais: ${sumiram.join(", ")}`);
  }
  const deOutroProjeto = disciplinas.filter((d) => d.projetoId !== link.projetoId);
  if (deOutroProjeto.length > 0) {
    console.log(`⚠ ${deOutroProjeto.length} disciplina(s) da whitelist são de OUTRO projeto.`);
  }

  console.log("\n=== Por disciplina ===");
  let totalValidados = 0;
  for (const d of disciplinas) {
    const validados = await prisma.upload.count({
      where: { disciplinaId: d.id, validado: true, excluidoEm: null },
    });
    const naoValidados = await prisma.upload.count({
      where: { disciplinaId: d.id, validado: false, excluidoEm: null },
    });
    const naLixeira = await prisma.upload.count({
      where: { disciplinaId: d.id, excluidoEm: { not: null } },
    });
    totalValidados += validados;
    console.log(
      `  ${d.disciplinaTextoLegado}: ${validados} validado(s) · ${naoValidados} pendente(s) · ${naLixeira} na lixeira`,
    );
  }

  const arts = await prisma.art.count({
    where: {
      projetoId: link.projetoId,
      arquivoPath: { not: null },
      OR: [{ disciplinaId: null }, { disciplinaId: { in: link.disciplinaIds } }],
    },
  });

  console.log(`\ntotal que a página deve mostrar: ${totalValidados} arquivo(s) + ${arts} ART(s)`);
  if (totalValidados === 0 && arts === 0) {
    console.log(
      "\n→ CAUSA: as disciplinas do link não têm NENHUM arquivo validado. O link só expõe arquivo\n" +
        "  aprovado — enviar não basta, é preciso validar a entrega. Valide em Aprovações ou pelo\n" +
        "  menu do arquivo, ou marque no link uma disciplina que já tenha arquivo validado.",
    );
  } else {
    console.log("\n→ O link deveria estar mostrando conteúdo. Se a página está vazia, me avise: o problema é outro.");
  }
  await prisma.$disconnect();
}

main();
