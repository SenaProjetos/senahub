import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { conteudoPublicoPorToken } from "../src/modules/projetos/arquivos/link-publico";

/**
 * Diagnóstico read-only de UM link público de arquivos: mostra a linha do link, o que
 * `conteudoPublicoPorToken` (a MESMA função que a página pública usa) resolve, e o estado
 * cru dos uploads da(s) disciplina(s) alcançadas — pra comparar lado a lado com o filtro.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/diag-link-arquivos.ts <token>
 */
async function main() {
    const token = process.argv[2];
    if (!token) {
        console.error("Uso: diag-link-arquivos.ts <token>");
        process.exit(1);
    }

    const link = await prisma.linkPublicoArquivos.findUnique({
        where: { token },
        include: { projeto: { select: { codigo: true, nome: true } } },
    });
    if (!link) {
        console.log("Link não encontrado para este token.");
        await prisma.$disconnect();
        return;
    }

    console.log("== Link ==");
    console.log({
        id: link.id,
        projeto: `${link.projeto.codigo} — ${link.projeto.nome}`,
        escopo: link.escopo,
        ativo: link.ativo,
        expiraEm: link.expiraEm,
        disciplinaIds: link.disciplinaIds,
        uploadIds: link.uploadIds,
    });

    console.log("\n== O que a página pública resolve (conteudoPublicoPorToken) ==");
    const conteudo = await conteudoPublicoPorToken(token);
    if (!conteudo) {
        console.log("null (link indisponível pro visitante)");
    } else {
        for (const d of conteudo.disciplinas) {
            console.log(`\nDisciplina: ${d.nome} (${d.arquivos.length} arquivo(s))`);
            for (const a of d.arquivos) {
                console.log(`  [${a.id}] ${a.nome}  v${a.versao}  ${a.tamanho}B`);
            }
        }
        console.log(`\nARTs: ${conteudo.arts.length}`);
    }

    // Estado cru de todo upload cujo nome contenha o pedaço passado em argv[3] (opcional),
    // pra comparar com o que apareceu acima. Sem filtro, lista as disciplinas alcançadas.
    const filtro = process.argv[3];
    const disciplinaIds =
        link.escopo === "projeto_todo"
            ? (await prisma.disciplina.findMany({ where: { projetoId: link.projetoId }, select: { id: true } })).map(
                (d) => d.id,
            )
            : link.disciplinaIds;

    console.log("\n== Uploads crus nas disciplinas do link (validado, excluidoEm, documentoId, revisao) ==");
    const uploads = await prisma.upload.findMany({
        where: {
            disciplinaId: { in: disciplinaIds },
            ...(filtro ? { nomeArquivo: { contains: filtro, mode: "insensitive" } } : {}),
            // ESCAPE HATCH do soft delete (lib/prisma.ts:52-60): leitura top-level de `upload`
            // recebe `excluidoEm: null` injetado. Sem `{ not: undefined }` este dump esconde a
            // LIXEIRA inteira e parece dizer que ela está vazia — foi assim que um diagnóstico
            // deste script já apontou para o lado errado.
            excluidoEm: { not: undefined },
        },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: {
            id: true,
            nomeArquivo: true,
            versao: true,
            validado: true,
            excluidoEm: true,
            pacote: true,
            pastaId: true,
            documentoId: true,
            documento: { select: { substituidoPorId: true } },
            revisaoId: true,
            revisao: { select: { numero: true } },
        },
    });
    for (const u of uploads) {
        console.log(
            `  [${u.id}] ${u.nomeArquivo}  v${u.versao}  validado=${u.validado}  excluidoEm=${u.excluidoEm ? u.excluidoEm.toISOString() : "null"}  pacote=${u.pacote}  pastaId=${u.pastaId ?? "null"}  documentoId=${u.documentoId ?? "null"}  substituidoPorId=${u.documento?.substituidoPorId ?? "null"}  revisaoId=${u.revisaoId ?? "null"}  revisaoNumero=${u.revisao?.numero ?? "null"}`,
        );
    }

    await prisma.$disconnect();
}

main();
