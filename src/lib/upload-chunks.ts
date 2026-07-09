import "server-only";
import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { resolverCaminho, type ArquivoSalvo } from "@/lib/storage";

/**
 * Upload em pedaços (chunked) para contornar o limite de 100 MB por request do
 * Cloudflare Tunnel (borda) — modelos IFC/BIM passam disso. O cliente fatia o
 * arquivo em pedaços < 100 MB, cada um vai num POST separado, e o servidor os
 * remonta em disco por STREAMING (um chunk por vez) — sem carregar o arquivo
 * inteiro na RAM, ao contrário de `Buffer.from(await file.arrayBuffer())`.
 *
 * Os chunks ficam em `<STORAGE_BASE_PATH>/.chunks/<userId>/<sessaoId>/NNNNNN`.
 * A sessão é limpa ao finalizar; órfãos (envio abandonado) são varridos por cron.
 */

const PREFIXO = ".chunks";

/** cuid/uuid-hex: só aceita caracteres seguros de caminho, barrando traversal. */
function idSeguro(s: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new Error("Identificador de upload inválido.");
  return s;
}

function dirSessao(userId: string, sessaoId: string): string {
  return resolverCaminho(`${PREFIXO}/${idSeguro(userId)}/${idSeguro(sessaoId)}`);
}

function nomeChunk(indice: number): string {
  return String(indice).padStart(6, "0");
}

/** Limite defensivo de pedaços (45 MB × 200 ≈ 9 GB, bem acima do teto da app de 1,5 GB). */
const MAX_CHUNKS = 200;

/** Grava um pedaço da sessão em disco. */
export async function guardarChunk(params: {
  userId: string;
  sessaoId: string;
  indice: number;
  total: number;
  chunk: Buffer;
}): Promise<void> {
  const { userId, sessaoId, indice, total, chunk } = params;
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) throw new Error("Total de pedaços inválido.");
  if (!Number.isInteger(indice) || indice < 0 || indice >= total) throw new Error("Índice de pedaço inválido.");
  const dir = dirSessao(userId, sessaoId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, nomeChunk(indice)), chunk);
}

/**
 * Remonta os `total` pedaços da sessão no arquivo `destinoRelativo` (streaming),
 * calcula o SHA-256 durante a escrita e apaga a sessão. Lança se faltar pedaço.
 */
export async function montarChunksEm(
  destinoRelativo: string,
  params: { userId: string; sessaoId: string; total: number },
): Promise<ArquivoSalvo> {
  const { userId, sessaoId, total } = params;
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) throw new Error("Total de pedaços inválido.");
  const dir = dirSessao(userId, sessaoId);

  const destinoFull = resolverCaminho(destinoRelativo);
  await fs.mkdir(path.dirname(destinoFull), { recursive: true });

  const hash = createHash("sha256");
  let tamanho = 0;
  const out = createWriteStream(destinoFull);
  try {
    for (let i = 0; i < total; i++) {
      const buf = await fs.readFile(path.join(dir, nomeChunk(i))); // lança se o pedaço faltar
      hash.update(buf);
      tamanho += buf.length;
      // Aguarda o callback de cada escrita antes de seguir — sem writes pendentes,
      // um erro adiante (pedaço faltando) pode destruir o stream sem corrida.
      await new Promise<void>((res, rej) => out.write(buf, (err) => (err ? rej(err) : res())));
    }
    await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
  } catch (err) {
    out.destroy();
    await fs.rm(destinoFull, { force: true }).catch(() => {});
    throw err;
  }

  await limparChunks(userId, sessaoId);
  return { caminho: destinoRelativo, hashSha256: hash.digest("hex"), tamanho };
}

/** Remove a sessão de chunks (best-effort). */
export async function limparChunks(userId: string, sessaoId: string): Promise<void> {
  try {
    await fs.rm(dirSessao(userId, sessaoId), { recursive: true, force: true });
  } catch {
    /* já removida */
  }
}

/**
 * Varre as sessões sob `.chunks` (userId/sessaoId) e remove aquelas cuja última
 * modificação passou de `maxIdadeMs` (envios abandonados). Retorna quantas foram apagadas.
 */
export async function limparChunksOrfaos(maxIdadeMs = 6 * 60 * 60 * 1000): Promise<number> {
  const raizFull = resolverCaminho(PREFIXO);
  let usuarios: string[];
  try {
    usuarios = await fs.readdir(raizFull);
  } catch {
    return 0; // pasta ainda não existe
  }
  const corte = Date.now() - maxIdadeMs;
  let removidas = 0;
  for (const u of usuarios) {
    const dirUser = path.join(raizFull, u);
    let sessoes: string[];
    try {
      sessoes = await fs.readdir(dirUser);
    } catch {
      continue;
    }
    for (const s of sessoes) {
      const dirS = path.join(dirUser, s);
      try {
        const st = await fs.stat(dirS);
        if (st.mtimeMs < corte) {
          await fs.rm(dirS, { recursive: true, force: true });
          removidas++;
        }
      } catch {
        /* corrida com outra limpeza */
      }
    }
    // Remove a pasta do usuário se ficou vazia.
    try {
      if ((await fs.readdir(dirUser)).length === 0) await fs.rmdir(dirUser);
    } catch {
      /* não vazia / sumiu */
    }
  }
  return removidas;
}
