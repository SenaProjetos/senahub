/**
 * Integridade do storage: uploads que o banco registra mas cujo arquivo NÃO está no disco.
 *
 * Somente leitura — não grava nada no banco nem mexe em arquivo.
 *
 * Por que existe: o backfill de tamanho de papel (2026-09-17) esbarrou em ENOENT em PDFs de
 * produção. Aquele script só olha documentos sem papel, então o número real pode ser maior. E
 * arquivo sumido é grave de um jeito específico: o backup do banco (pg_dump) NÃO contém arquivo
 * nenhum — só o espelho do storage contém. Se o disco perdeu, só o espelho devolve.
 *
 * Para cada arquivo ausente, tenta dizer POR QUÊ:
 *  - existe com o mesmo nome em outra pasta do projeto → arquivo movido sem o banco acompanhar;
 *  - existe no espelho do backup (STORAGE_BACKUP_PATH) → dá para restaurar de lá;
 *  - não existe em lugar nenhum → perdido.
 * E mostra os últimos eventos do documento (renomear, mover, restaurar da lixeira...), que
 * costumam explicar o descompasso.
 *
 * Roda NO SERVIDOR (precisa do STORAGE_BASE_PATH de verdade):
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-arquivos-no-disco.ts
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-arquivos-no-disco.ts --lixeira
 *
 * `--lixeira` inclui os uploads excluídos (restauráveis por 30 dias — restaurar um sem arquivo
 * devolve uma linha que não abre).
 */
import "dotenv/config";
import { stat, readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";

const incluirLixeira = process.argv.includes("--lixeira");

async function existe(caminhoAbsoluto: string): Promise<boolean> {
  try {
    await stat(caminhoAbsoluto);
    return true;
  } catch {
    return false;
  }
}

/** Todos os arquivos sob `raiz`, indexados pelo nome — para achar arquivo movido de pasta. */
async function indexarPorNome(raiz: string, indice: Map<string, string[]>, profundidade = 0): Promise<void> {
  if (profundidade > 8) return;
  let entradas;
  try {
    entradas = await readdir(raiz, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas) {
    const completo = path.join(raiz, e.name);
    if (e.isDirectory()) await indexarPorNome(completo, indice, profundidade + 1);
    else {
      const chave = e.name.toLowerCase();
      const lista = indice.get(chave) ?? [];
      lista.push(completo);
      indice.set(chave, lista);
    }
  }
}

async function main() {
  const base = process.env.STORAGE_BASE_PATH;
  if (!base) throw new Error("STORAGE_BASE_PATH não definido — rode no servidor, com o .env de produção.");
  const espelho = process.env.STORAGE_BACKUP_PATH ?? (process.env.BACKUP_PATH ? path.join(process.env.BACKUP_PATH, "storage") : null);

  const uploads = await prisma.upload.findMany({
    // `{ not: undefined }` é o escape do filtro automático de lixeira (lib/prisma.ts): sem ele,
    // `--lixeira` não veria os excluídos.
    where: incluirLixeira ? { excluidoEm: { not: undefined } } : { excluidoEm: null },
    select: {
      id: true,
      nomeArquivo: true,
      caminho: true,
      pacote: true,
      pastaId: true,
      versao: true,
      origem: true,
      createdAt: true,
      excluidoEm: true,
      documentoId: true,
      autorId: true,
      disciplina: {
        select: {
          disciplinaTextoLegado: true,
          projeto: { select: { codigo: true, nome: true } },
        },
      },
    },
  });

  console.log(`=== Integridade do storage (só leitura) ===`);
  console.log(`storage: ${base}`);
  console.log(`espelho do backup: ${espelho ?? "(não configurado)"}`);
  console.log(`uploads verificados: ${uploads.length}${incluirLixeira ? " (inclui lixeira)" : " (só vivos)"}\n`);

  const ausentes: typeof uploads = [];
  for (const u of uploads) {
    let absoluto: string;
    try {
      absoluto = resolverCaminho(u.caminho);
    } catch {
      ausentes.push(u); // caminho fora da área permitida também é "não abre"
      continue;
    }
    if (!(await existe(absoluto))) ausentes.push(u);
  }

  if (ausentes.length === 0) {
    console.log("Nenhum arquivo ausente. Storage íntegro.");
    return;
  }

  // Índice por nome só das pastas de projeto afetadas — varrer o storage inteiro seria caro.
  const pastasDeProjeto = new Set(ausentes.map((u) => u.caminho.split("/").slice(0, 3).join("/")));
  const indice = new Map<string, string[]>();
  for (const p of pastasDeProjeto) await indexarPorNome(path.join(base, p), indice);

  const autores = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(ausentes.map((u) => u.autorId))] } }, select: { id: true, name: true } }))
      .map((u) => [u.id, u.name]),
  );

  const causas = { movido: 0, noEspelho: 0, perdido: 0 };
  const porProjeto = new Map<string, typeof ausentes>();
  for (const u of ausentes) {
    const chave = `${u.disciplina.projeto.codigo} · ${u.disciplina.projeto.nome} / ${u.disciplina.disciplinaTextoLegado}`;
    const lista = porProjeto.get(chave) ?? [];
    lista.push(u);
    porProjeto.set(chave, lista);
  }

  for (const [grupo, lista] of porProjeto) {
    console.log(`\n### ${grupo} — ${lista.length} ausente(s)`);
    for (const u of lista) {
      const nomeFisico = path.basename(u.caminho);
      const emOutroLugar = indice.get(nomeFisico.toLowerCase()) ?? [];
      const noEspelho = espelho ? await existe(path.join(espelho, u.caminho)) : false;

      let causa: string;
      if (emOutroLugar.length > 0) {
        causa = `MOVIDO — existe em: ${emOutroLugar.map((c) => path.relative(base, c)).join(" | ")}`;
        causas.movido++;
      } else if (noEspelho) {
        causa = "PERDIDO NO DISCO, EXISTE NO ESPELHO — restaurável";
        causas.noEspelho++;
      } else {
        causa = "PERDIDO — nem no disco nem no espelho";
        causas.perdido++;
      }

      console.log(`  • ${u.nomeArquivo}  (v${u.versao}, ${u.pacote ?? `pasta ${u.pastaId}`}, origem ${u.origem})`);
      console.log(`      upload ${u.id} · enviado ${u.createdAt.toISOString().slice(0, 16).replace("T", " ")} por ${autores.get(u.autorId) ?? "?"}${u.excluidoEm ? " · NA LIXEIRA" : ""}`);
      console.log(`      caminho: ${u.caminho}`);
      console.log(`      ${causa}`);

      if (u.documentoId) {
        const eventos = await prisma.documentoEvento.findMany({
          where: { documentoId: u.documentoId, categoria: "alteracao" },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { tipo: true, createdAt: true, detalhe: true },
        }).catch(() => []);
        for (const ev of eventos) {
          console.log(`      evento: ${ev.tipo} em ${ev.createdAt.toISOString().slice(0, 16).replace("T", " ")} ${JSON.stringify(ev.detalhe).slice(0, 120)}`);
        }
      }
    }
  }

  console.log(`\n=== resumo ===`);
  console.log(`ausentes: ${ausentes.length} de ${uploads.length}`);
  console.log(`  movidos (existem em outra pasta): ${causas.movido}`);
  console.log(`  só no espelho (restauráveis):     ${causas.noEspelho}`);
  console.log(`  perdidos de vez:                  ${causas.perdido}`);
  console.log(`\nNada foi alterado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
