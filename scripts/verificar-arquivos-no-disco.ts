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
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-arquivos-no-disco.ts --restaurar
 *
 * `--lixeira` inclui os uploads excluídos (restauráveis por 30 dias — restaurar um sem arquivo
 * devolve uma linha que não abre).
 *
 * `--restaurar` copia do espelho de volta para o storage SÓ o arquivo cujo SHA-256 no espelho é
 * igual ao `Upload.hashSha256` gravado no envio, e nunca sobrescreve arquivo que já existe. Fora
 * isso, nada é alterado — nem no banco.
 *
 * Causa conhecida (corrigida em 2026-10-20): o contador de versão da rota de upload não via a
 * lixeira. Reenviar um arquivo que estava na lixeira gravava no MESMO caminho físico, e a purga
 * da lixeira (30 dias depois, ou "Excluir definitivamente") apagava o arquivo da linha viva. O
 * script aponta esse caso como "PROVÁVEL CAMINHO DIVIDIDO" (heurística: outro upload do mesmo documento
 * foi para a lixeira e já não existe). O hash da linha viva é o do ÚLTIMO envio — o que ficou no disco.
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";

const incluirLixeira = process.argv.includes("--lixeira");
const restaurar = process.argv.includes("--restaurar");

/**
 * Copia do espelho para `<destino>.parcial`, confere o hash da CÓPIA e só então renomeia — uma cópia
 * interrompida nunca fica no caminho final (contaria como "existe" e não seria mais consertada).
 * Devolve false se o arquivo apareceu no destino no meio do caminho (não sobrescreve).
 */
async function restaurarDoEspelho(origem: string, caminhoRel: string, hashEsperado: string): Promise<boolean> {
  const destino = resolverCaminho(caminhoRel);
  const parcial = `${destino}.parcial`;
  await mkdir(path.dirname(destino), { recursive: true });
  try {
    await copyFile(origem, parcial);
    if ((await sha256(parcial)) !== hashEsperado) throw new Error("hash da cópia não confere (o espelho mudou?)");
    if (await existe(destino)) return false;
    await rename(parcial, destino);
    return true;
  } finally {
    await rm(parcial, { force: true });
  }
}

async function sha256(caminhoAbsoluto: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const parte of createReadStream(caminhoAbsoluto)) hash.update(parte as Buffer);
  return hash.digest("hex");
}

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
      hashSha256: true,
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

  console.log(`=== Integridade do storage (${restaurar ? "RESTAURA do espelho o que confere pelo hash" : "só leitura"}) ===`);
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

  const causas = { movido: 0, noEspelho: 0, perdido: 0, restaurados: 0, falhas: 0, caminhoDividido: 0 };
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
      // Só olha o espelho se o caminho do banco cai DENTRO dele (o caminho vem do banco, não confiar).
      const origem = espelho ? path.resolve(espelho, u.caminho) : null;
      const dentroDoEspelho = !!origem && !!espelho && !path.relative(path.resolve(espelho), origem).startsWith("..");
      const noEspelho = dentroDoEspelho && origem ? await existe(origem) : false;

      let causa: string;
      if (emOutroLugar.length > 0) {
        causa = `MOVIDO — existe em: ${emOutroLugar.map((c) => path.relative(base, c)).join(" | ")}`;
        causas.movido++;
      } else if (noEspelho && origem) {
        const confere = (await sha256(origem)) === u.hashSha256;
        causa = confere
          ? "PERDIDO NO DISCO, EXISTE NO ESPELHO com o mesmo hash — restaurável"
          : "PERDIDO NO DISCO, EXISTE NO ESPELHO mas com OUTRO conteúdo (hash diferente) — não restaura sozinho";
        causas.noEspelho++;
        if (restaurar && confere) {
          try {
            if (await restaurarDoEspelho(origem, u.caminho, u.hashSha256)) {
              causa += " → RESTAURADO";
              causas.restaurados++;
            } else {
              causa += " → NÃO restaurado (o arquivo apareceu no disco)";
            }
          } catch (e) {
            causa += ` → FALHOU ao restaurar: ${e instanceof Error ? e.message : String(e)}`;
            causas.falhas++;
          }
        }
      } else {
        causa = "PERDIDO — nem no disco nem no espelho";
        causas.perdido++;
      }

      console.log(`  • ${u.nomeArquivo}  (v${u.versao}, ${u.pacote ?? `pasta ${u.pastaId}`}, origem ${u.origem})`);
      console.log(`      upload ${u.id} · enviado ${u.createdAt.toISOString().slice(0, 16).replace("T", " ")} por ${autores.get(u.autorId) ?? "?"}${u.excluidoEm ? " · NA LIXEIRA" : ""}`);
      console.log(`      caminho: ${u.caminho}`);
      console.log(`      ${causa}`);

      // Caminho dividido: outro upload do mesmo documento foi para a lixeira e já não existe (purgado).
      if (u.documentoId) {
        const foramParaLixeira = await prisma.documentoEvento.findMany({
          where: { documentoId: u.documentoId, tipo: { in: ["lixeira", "exclusao_definitiva"] }, uploadId: { not: null } },
          select: { uploadId: true },
        });
        const ids = [...new Set(foramParaLixeira.map((e) => e.uploadId!).filter((id) => id !== u.id))];
        if (ids.length > 0) {
          const aindaExistem = await prisma.upload.findMany({
            where: { id: { in: ids }, excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } },
            select: { id: true },
          });
          const purgados = ids.filter((id) => !aindaExistem.some((x) => x.id === id));
          if (purgados.length > 0) {
            console.log(`      PROVÁVEL CAMINHO DIVIDIDO: upload(s) do mesmo documento já purgado(s) da lixeira: ${purgados.join(", ")}`);
            causas.caminhoDividido++;
          }
        }
      }

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
  console.log(`  com upload irmão já purgado:      ${causas.caminhoDividido}`);
  if (restaurar) console.log(`\nRestaurados do espelho: ${causas.restaurados} · falhas: ${causas.falhas}. O banco não foi alterado.`);
  else console.log(`\nNada foi alterado. Use --restaurar para copiar do espelho o que confere pelo hash.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
