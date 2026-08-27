import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { linkVigente } from "../src/lib/link-publico";
import { recortarParaLinkPublico } from "../src/modules/projetos/arquivos/link-publico-regras";

/**
 * Diagnóstico somente-leitura dos links públicos de arquivos de um projeto.
 *
 * A página pública mostra "0 arquivos" por motivos diferentes, e de fora eles são
 * indistinguíveis: link expirado/revogado, whitelist de disciplina vazia, disciplina da
 * whitelist que não existe mais, nenhum arquivo validado, ou tudo o que havia caiu no
 * recorte novo (revisão anterior / backup do modelo). Este script diz qual é.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-link-publico.ts <codigo-do-projeto>
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-link-publico.ts --token <token>
 *
 * Não escreve nada.
 */

const SELECT_REGRAS = {
  pacote: true,
  documentoId: true,
  documento: { select: { substituidoPorId: true } },
  revisao: { select: { numero: true } },
} as const;

type Linha = {
  id: string;
  pacote: string | null;
  documentoId: string | null;
  documento: { substituidoPorId: string | null } | null;
  revisao: { numero: number } | null;
};

const paraRecorte = (u: Linha) => ({
  ...u,
  documentoCanonicoId: u.documento?.substituidoPorId ?? null,
  revisaoNumero: u.revisao?.numero ?? null,
});

async function diagnosticarLink(link: {
  id: string;
  nome: string | null;
  escopo: string;
  token: string;
  ativo: boolean;
  expiraEm: Date | null;
  disciplinaIds: string[];
  uploadIds: string[];
  projetoId: string;
}) {
  console.log(`\n--- Link ${link.nome ? `"${link.nome}"` : "(sem nome)"} · escopo ${link.escopo} ---`);
  console.log(`token: ${link.token.slice(0, 8)}…`);
  console.log(`ativo: ${link.ativo} | expira: ${link.expiraEm ? link.expiraEm.toISOString() : "nunca"} | vigente: ${linkVigente(link)}`);

  if (!linkVigente(link)) {
    console.log("→ CAUSA: link revogado ou expirado. A página mostra 'link indisponível'.");
    return;
  }

  if (link.escopo === "selecao") {
    const vivos = await prisma.upload.count({ where: { id: { in: link.uploadIds }, excluidoEm: null } });
    console.log(`arquivos escolhidos: ${link.uploadIds.length} · ainda publicáveis: ${vivos}`);
    if (vivos === 0) {
      console.log("→ CAUSA: todos os arquivos escolhidos foram para a lixeira (ou já foram purgados).");
    } else {
      console.log(`→ A página deve mostrar ${vivos} arquivo(s).`);
    }
    return;
  }

  const disciplinaIds =
    link.escopo === "projeto_todo"
      ? (await prisma.disciplina.findMany({ where: { projetoId: link.projetoId }, select: { id: true } })).map((d) => d.id)
      : link.disciplinaIds;

  if (disciplinaIds.length === 0) {
    console.log(
      link.escopo === "projeto_todo"
        ? "→ CAUSA: o projeto não tem nenhuma disciplina."
        : "→ CAUSA: nenhuma disciplina marcada no link. Abra o gerenciador e selecione as disciplinas.",
    );
    return;
  }

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: disciplinaIds } },
    select: { id: true, disciplinaTextoLegado: true, projetoId: true },
  });
  const sumiram = disciplinaIds.filter((id) => !disciplinas.some((d) => d.id === id));
  if (sumiram.length > 0) console.log(`⚠ ${sumiram.length} disciplina(s) do link NÃO existem mais.`);
  const deOutro = disciplinas.filter((d) => d.projetoId !== link.projetoId);
  if (deOutro.length > 0) console.log(`⚠ ${deOutro.length} disciplina(s) do link são de OUTRO projeto.`);

  let totalPublicado = 0;
  for (const d of disciplinas) {
    const validados = await prisma.upload.findMany({
      where: { disciplinaId: d.id, validado: true, excluidoEm: null },
      select: { id: true, ...SELECT_REGRAS },
    });
    const publicados = recortarParaLinkPublico(validados.map(paraRecorte));
    const backups = validados.filter((u) => u.pacote === "B").length;
    const revisaoVelha = validados.length - backups - publicados.length;
    const pendentes = await prisma.upload.count({
      where: { disciplinaId: d.id, validado: false, excluidoEm: null },
    });
    const naLixeira = await prisma.upload.count({
      where: { disciplinaId: d.id, excluidoEm: { not: null } },
    });
    totalPublicado += publicados.length;
    console.log(
      `  ${d.disciplinaTextoLegado}: ${publicados.length} publicado(s)` +
        ` · ${revisaoVelha} revisão anterior · ${backups} backup do modelo` +
        ` · ${pendentes} não validado(s) · ${naLixeira} na lixeira`,
    );
  }

  const arts = await prisma.art.count({
    where: {
      projetoId: link.projetoId,
      arquivoPath: { not: null },
      OR: [{ disciplinaId: null }, { disciplinaId: { in: disciplinaIds } }],
    },
  });

  console.log(`→ A página deve mostrar ${totalPublicado} arquivo(s) + ${arts} ART(s).`);
  if (totalPublicado === 0 && arts === 0) {
    console.log(
      "→ CAUSA: nada sobrevive ao recorte. O link só expõe a última revisão de cada documento,\n" +
        "  validada, fora da lixeira e sem backup do modelo. Confira as colunas acima para saber\n" +
        "  se o que falta é validação ou se tudo o que existe é revisão anterior/backup.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const porToken = args[0] === "--token" ? args[1] : null;
  const codigo = porToken ? null : args[0];

  if (!porToken && !codigo) {
    console.log("Informe o código do projeto (ex.: 260029) ou --token <token>.");
    await prisma.$disconnect();
    return;
  }

  const links = await prisma.linkPublicoArquivos.findMany({
    where: porToken ? { token: porToken } : { projeto: { codigo: codigo! } },
    orderBy: { createdAt: "asc" },
    include: { projeto: { select: { codigo: true, nome: true } } },
  });

  if (links.length === 0) {
    console.log("Nenhum link público encontrado para esse projeto/token.");
    console.log("→ Causa: o link nunca foi criado. Gere um pela aba Arquivos do projeto.");
    await prisma.$disconnect();
    return;
  }

  console.log(`=== Links públicos — ${links[0].projeto.codigo} · ${links[0].projeto.nome} ===`);
  console.log(`${links.length} link(s) no projeto.`);
  for (const link of links) await diagnosticarLink(link);

  await prisma.$disconnect();
}

main();
