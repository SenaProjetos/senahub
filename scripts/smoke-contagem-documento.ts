/**
 * Smoke da unidade de contagem da árvore de arquivos, contra o banco de dev.
 *
 * A regra, validada em 2026-09-17 (produção consultada: ZERO upload vivo sem `documentoId`):
 *
 *     1 DocumentoDisciplina = 1 documento. Uploads são os ARQUIVOS dele.
 *
 * O total da disciplina passou a sair da árvore de navegação (`DocumentoDisciplina`) em vez de
 * ser reconstruído a partir dos uploads com `Set(documentoId ?? uploadId)`. Este smoke prende
 * essa semântica: é SQL e relação, coisa que o vitest (sem banco) não alcança.
 *
 * Cria projeto, disciplinas, documentos e uploads throwaway, e apaga tudo no final.
 * Uso: npm run smoke:contagem-documento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { arvoreArquivosProjeto } from "../src/modules/projetos/arquivos/queries";
import { arvoreNavegacaoDocumentos } from "../src/modules/uploads/documentos-agrupados";
import { chaveDocumento } from "../src/modules/uploads/documento";

const TAG = `SMKCONT_${Date.now()}`;

let seq = 0;
async function novoUpload(args: {
  disciplinaId: string;
  documentoId: string | null;
  nome: string;
  autorId: string;
  pastaId?: string;
  excluido?: boolean;
}) {
  seq++;
  return prisma.upload.create({
    data: {
      disciplinaId: args.disciplinaId,
      documentoId: args.documentoId,
      // `pacote` XOR `pastaId` é invariante do schema — arquivo em pasta não tem pacote.
      pacote: args.pastaId ? null : "A",
      pastaId: args.pastaId,
      nomeArquivo: args.nome,
      caminho: `${TAG}/${seq}_${args.nome}`,
      hashSha256: `${TAG}${seq}`.padEnd(64, "0").slice(0, 64),
      tamanho: 512,
      autorId: args.autorId,
      ...(args.excluido ? { excluidoEm: new Date() } : {}),
    },
  });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(":5433/") || !url.includes("senahub_remake")) {
    throw new Error("Este smoke só roda no banco de dev (porta 5433, senahub_remake).");
  }

  let ok = true;
  const check = (nome: string, cond: boolean, detalhe?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { ativo: true }, select: { id: true } });
  if (!autor) throw new Error("Banco de dev sem usuário ativo.");

  let clienteId = "";
  let projetoId = "";

  try {
    const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${TAG}_cli` } });
    clienteId = cliente.id;
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano, sequencial, codigo, tipo: "particular", nome: `${TAG}_proj`, clienteId: cliente.id,
          disciplinas: {
            create: [
              { disciplinaTextoLegado: "Estrutural", ordem: 0 },
              { disciplinaTextoLegado: "Elétrico", ordem: 1 },
              { disciplinaTextoLegado: "Hidrossanitário", ordem: 2 },
              { disciplinaTextoLegado: "Arquitetura", ordem: 3 },
            ],
          },
        },
        include: { disciplinas: { orderBy: { ordem: "asc" } } },
      });
    });
    projetoId = projeto.id;
    const [dCaso12, dCaso3, dCaso45, dCaso6] = projeto.disciplinas.map((d) => d.id);

    // ── Casos 1 e 2: um documento com 2 arquivos, outro com 3 ───────────────
    const doc1 = await prisma.documentoDisciplina.create({
      data: { disciplinaId: dCaso12, chave: `A/${TAG}-c1`, nomeArquivo: `${TAG}-c1.pdf` },
    });
    await novoUpload({ disciplinaId: dCaso12, documentoId: doc1.id, nome: `${TAG}-c1.pdf`, autorId: autor.id });
    await novoUpload({ disciplinaId: dCaso12, documentoId: doc1.id, nome: `${TAG}-c1.dwg`, autorId: autor.id });

    const doc2 = await prisma.documentoDisciplina.create({
      data: { disciplinaId: dCaso12, chave: `A/${TAG}-c2`, nomeArquivo: `${TAG}-c2.pdf` },
    });
    for (const ext of ["pdf", "dwg", "zip"]) {
      await novoUpload({ disciplinaId: dCaso12, documentoId: doc2.id, nome: `${TAG}-c2.${ext}`, autorId: autor.id });
    }

    // ── Caso 3: dois documentos, dois arquivos cada, em outra disciplina ────
    for (const sufixo of ["a", "b"]) {
      const doc = await prisma.documentoDisciplina.create({
        data: { disciplinaId: dCaso3, chave: `A/${TAG}-c3${sufixo}`, nomeArquivo: `${TAG}-c3${sufixo}.pdf` },
      });
      await novoUpload({ disciplinaId: dCaso3, documentoId: doc.id, nome: `${TAG}-c3${sufixo}.pdf`, autorId: autor.id });
      await novoUpload({ disciplinaId: dCaso3, documentoId: doc.id, nome: `${TAG}-c3${sufixo}.dwg`, autorId: autor.id });
    }

    // ── Caso 4: documento aposentado por merge (o upload vai para o canônico) ──
    const canonico = await prisma.documentoDisciplina.create({
      data: { disciplinaId: dCaso45, chave: `A/${TAG}-c4`, nomeArquivo: `${TAG}-c4.pdf` },
    });
    await prisma.documentoDisciplina.create({
      data: { disciplinaId: dCaso45, chave: `merged:${TAG}-c4`, nomeArquivo: `${TAG}-c4-alias.pdf`, substituidoPorId: canonico.id },
    });
    await novoUpload({ disciplinaId: dCaso45, documentoId: canonico.id, nome: `${TAG}-c4.pdf`, autorId: autor.id });

    // ── Caso 5: arquivo em PastaProjeto, na MESMA disciplina do caso 4 ──────
    // A chave tem de ser a que `chaveDocumento` produz (`pasta:<id>/base`): montar como "A/…"
    // testaria um estado que a aplicação não sabe criar.
    const pasta = await prisma.pastaProjeto.create({
      data: { disciplinaId: dCaso45, nome: `${TAG}_pasta`, caminho: `${TAG}_pasta`, origem: "custom", ordem: 0 },
    });
    const docPasta = await prisma.documentoDisciplina.create({
      data: {
        disciplinaId: dCaso45,
        chave: chaveDocumento({ pacote: null, pastaId: pasta.id, nomeArquivo: `${TAG}-c5.pdf` }),
        nomeArquivo: `${TAG}-c5.pdf`,
      },
    });
    await novoUpload({ disciplinaId: dCaso45, documentoId: docPasta.id, nome: `${TAG}-c5.pdf`, autorId: autor.id, pastaId: pasta.id });

    // ── Caso 6: documento cujo ÚNICO upload está na lixeira ─────────────────
    const docMorto = await prisma.documentoDisciplina.create({
      data: { disciplinaId: dCaso6, chave: `A/${TAG}-c6`, nomeArquivo: `${TAG}-c6.pdf` },
    });
    await novoUpload({ disciplinaId: dCaso6, documentoId: docMorto.id, nome: `${TAG}-c6.pdf`, autorId: autor.id, excluido: true });

    // ── Caso 7: upload órfão (documentoId null) na disciplina do caso 6 ─────
    const orfao = await novoUpload({ disciplinaId: dCaso6, documentoId: null, nome: `${TAG}-c7-orfao.pdf`, autorId: autor.id });

    // ── Leitura pelas DUAS fontes ───────────────────────────────────────────
    const [arv, nav] = await Promise.all([
      arvoreArquivosProjeto(projetoId, autor.id, true, { veTodas: true, podeEnviarCap: true }),
      arvoreNavegacaoDocumentos({ projetoIds: [projetoId], userId: autor.id, veTodas: true }),
    ]);
    const porDisciplina = new Map(arv.disciplinas.map((d) => [d.id, d]));
    // A contagem oficial: soma das FASES (um documento tem uma fase só). Somar extensões
    // inflaria — um documento com PDF e DWG aparece nas duas.
    const docsDe = (disciplinaId: string) =>
      (nav.find((n) => n.disciplinaId === disciplinaId)?.fases ?? []).reduce((s, f) => s + f.total, 0);
    const uploadsDe = (disciplinaId: string) => {
      const d = porDisciplina.get(disciplinaId);
      return (d?.arquivos.length ?? 0) + (d?.arquivosPasta.length ?? 0);
    };

    check("caso 1+2: 2 documentos e 5 arquivos (PDF+DWG e PDF+DWG+ZIP)",
      docsDe(dCaso12) === 2 && uploadsDe(dCaso12) === 5,
      `${docsDe(dCaso12)} documento(s), ${uploadsDe(dCaso12)} arquivo(s)`);

    check("caso 3: 2 documentos e 4 arquivos",
      docsDe(dCaso3) === 2 && uploadsDe(dCaso3) === 4,
      `${docsDe(dCaso3)} documento(s), ${uploadsDe(dCaso3)} arquivo(s)`);

    check("caso 4+5: canônico + documento de pasta = 2 documentos (o apelido não conta)",
      docsDe(dCaso45) === 2,
      `${docsDe(dCaso45)} documento(s), ${uploadsDe(dCaso45)} arquivo(s)`);
    check("caso 4: documento substituído não aparece na árvore",
      !nav.some((n) => n.disciplinaId === dCaso45 && n.fases.some((f) => f.total > 2)));
    check("caso 5: arquivo em PastaProjeto não vira unidade extra",
      uploadsDe(dCaso45) === 2 && docsDe(dCaso45) === 2);

    check("caso 6: documento sem upload vivo não conta como documento",
      docsDe(dCaso6) === 0,
      `${docsDe(dCaso6)} documento(s)`);
    check("caso 6: nem como arquivo (upload na lixeira sai das duas leituras)",
      !porDisciplina.get(dCaso6)?.arquivos.some((a) => a.nome.includes("-c6.")));

    // Caso 7 — semântica ESCOLHIDA, não incidental: o órfão existe como Upload, e a contagem
    // de documentos o ignora. Produção verificada em 2026-09-17 com zero órfãos; se um
    // aparecer por script, ele fica fora do número em vez de virar unidade própria.
    const orfaoNaLeituraDeArquivos = porDisciplina.get(dCaso6)?.arquivos.some((a) => a.id === orfao.id) ?? false;
    check("caso 7: upload órfão existe como arquivo…", orfaoNaLeituraDeArquivos);
    check("caso 7: …e NÃO conta como documento (decisão explícita)", docsDe(dCaso6) === 0);

    // Fecho: a soma por disciplina é a soma dos documentos do projeto.
    const totalProjeto = arv.disciplinas.reduce((s, d) => s + docsDe(d.id), 0);
    check("total do projeto = 6 documentos", totalProjeto === 6, `${totalProjeto}`);
  } finally {
    if (projetoId) await prisma.projeto.deleteMany({ where: { id: projetoId } });
    if (clienteId) await prisma.cliente.deleteMany({ where: { id: clienteId } });
  }

  console.log(ok ? "\nSmoke de contagem: OK" : "\nSmoke de contagem: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
