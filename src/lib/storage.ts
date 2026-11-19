import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const BASE = process.env.STORAGE_BASE_PATH;

function base(): string {
  if (!BASE) throw new Error("STORAGE_BASE_PATH não configurado.");
  return path.resolve(BASE);
}

/** Junta partes ao base garantindo que o resultado fique DENTRO do base (anti path-traversal). */
export function resolverCaminho(relativo: string): string {
  const b = base();
  const full = path.resolve(b, relativo);
  const rel = path.relative(b, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Caminho fora da área permitida.");
  }
  return full;
}

/** Remove caracteres perigosos de um segmento de caminho. */
export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "item"
  );
}

/** Mantém só o nome do arquivo, descartando qualquer caminho original (Windows ou POSIX). */
export function nomeArquivoLimpo(nome: string): string {
  const semCaminho = nome.split(/[\\/]/).pop() ?? nome;
  return semCaminho.trim() || "arquivo";
}

export type ArquivoSalvo = {
  caminho: string; // relativo ao base
  hashSha256: string;
  tamanho: number;
};

/** Sufixo do arquivo temporário de `salvarArquivo` (vive milissegundos, na mesma pasta do destino). */
export const SUFIXO_GRAVACAO_PARCIAL = ".gravando";

/** Erros do Windows de arquivo segurado por outro programa (antivírus, indexador, leitor) — passam sozinhos. */
const TRAVA_PASSAGEIRA = new Set(["EBUSY", "EPERM", "EACCES"]);

/** `rename` que espera um pouco quando o destino está segurado por outro programa (até 4 tentativas). */
async function renomearComEspera(de: string, para: string): Promise<void> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await fs.rename(de, para);
      return;
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException).code ?? "";
      if (tentativa >= 4 || !TRAVA_PASSAGEIRA.has(codigo)) throw erro;
      await new Promise((r) => setTimeout(r, 100 * tentativa));
    }
  }
}

/**
 * Salva um buffer em `relativo` (criando diretórios). Retorna hash SHA-256 e tamanho.
 *
 * Grava num temporário da mesma pasta e só então o renomeia sobre o destino: o nome final nunca tem
 * um arquivo pela metade. Falhou (disco cheio, rede do compartilhamento caiu) → o temporário é apagado,
 * o destino fica como estava (o conteúdo anterior, ou o arquivo vazio de `reservarCaminhoLivre`) e o
 * erro sobe. Sem isso, um arquivo truncado com o nome certo pareceria um anexo válido, e regravar um
 * caminho fixo (avatar, logo, PDF gerado) apagava o conteúdo bom antes de falhar.
 */
export async function salvarArquivo(relativo: string, conteudo: Buffer): Promise<ArquivoSalvo> {
  const full = resolverCaminho(relativo);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const temporario = `${full}.${randomBytes(6).toString("hex")}${SUFIXO_GRAVACAO_PARCIAL}`;
  try {
    await fs.writeFile(temporario, conteudo, { flag: "wx" });
    await renomearComEspera(temporario, full);
  } catch (erro) {
    await fs.rm(temporario, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    throw erro;
  }
  const hashSha256 = createHash("sha256").update(conteudo).digest("hex");
  return { caminho: relativo, hashSha256, tamanho: conteudo.length };
}

export async function lerArquivo(relativo: string): Promise<Buffer> {
  return fs.readFile(resolverCaminho(relativo));
}

/**
 * Arquivo para download por STREAM: confere que é um arquivo no disco (ausente, pasta ou caminho fora do
 * base lança, e a rota responde 410) e devolve o tamanho para o `Content-Length`. O stream só é aberto em
 * `abrir()`, na hora de responder — assim nada fica aberto se a rota sair antes por outro motivo.
 */
export async function arquivoParaStream(
  relativo: string,
): Promise<{ tamanho: number; abrir: () => ReadableStream<Uint8Array> }> {
  const full = resolverCaminho(relativo);
  const info = await fs.stat(full);
  if (!info.isFile()) throw new Error("Não é um arquivo.");
  return {
    tamanho: info.size,
    abrir: () => Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
  };
}

/** Lê somente o cabeçalho de um arquivo, para validar assinatura sem carregar upload grande na RAM. */
export async function lerInicioArquivo(relativo: string, maxBytes = 128): Promise<Buffer> {
  const arquivo = await fs.open(resolverCaminho(relativo), "r");
  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const { bytesRead } = await arquivo.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await arquivo.close();
  }
}

export async function existeArquivo(relativo: string): Promise<boolean> {
  try {
    await fs.access(resolverCaminho(relativo));
    return true;
  } catch {
    return false;
  }
}

/**
 * Separa os itens cujo `caminho` é um arquivo no disco dos que não são (sumiu, virou pasta ou cai fora do
 * base). Mantém a ordem. Para montar um pacote (.zip) só com o que existe e registrar só o que entrou.
 */
export async function separarPorExistencia<T extends { caminho: string }>(
  itens: T[],
): Promise<{ presentes: T[]; ausentes: T[] }> {
  const presentes: T[] = [];
  const ausentes: T[] = [];
  for (const item of itens) {
    let eArquivo = false;
    try {
      eArquivo = (await fs.stat(resolverCaminho(item.caminho))).isFile();
    } catch {
      eArquivo = false;
    }
    (eArquivo ? presentes : ausentes).push(item);
  }
  return { presentes, ausentes };
}

/** Remove um arquivo do disco. Best-effort: ignora se já não existe. */
export async function removerArquivo(relativo: string): Promise<void> {
  try {
    await fs.unlink(resolverCaminho(relativo));
  } catch {
    /* já removido */
  }
}

/**
 * Copia um arquivo por STREAM (sem carregar na RAM — anexos chegam a 500 MB), calculando SHA-256 e tamanho no
 * caminho. Falhou no meio → apaga o destino parcial e relança.
 */
export async function copiarArquivo(relativoDe: string, relativoPara: string): Promise<ArquivoSalvo> {
  const de = resolverCaminho(relativoDe);
  const para = resolverCaminho(relativoPara);
  await fs.mkdir(path.dirname(para), { recursive: true });
  const hash = createHash("sha256");
  let tamanho = 0;
  const contador = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      tamanho += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await pipeline(createReadStream(de), contador, createWriteStream(para));
  } catch (erro) {
    await fs.rm(para, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    throw erro;
  }
  return { caminho: relativoPara, hashSha256: hash.digest("hex"), tamanho };
}

/** Move um arquivo entre dois caminhos relativos (cria diretórios do destino). */
export async function moverArquivo(relativoDe: string, relativoPara: string): Promise<void> {
  const de = resolverCaminho(relativoDe);
  const para = resolverCaminho(relativoPara);
  await fs.mkdir(path.dirname(para), { recursive: true });
  await fs.rename(de, para);
}

/** Arquivos (não subpastas) diretamente em `dirRelativo`, com a data de modificação. Pasta inexistente = vazio. */
export async function listarArquivos(dirRelativo: string): Promise<{ caminho: string; modificadoEm: Date }[]> {
  const dir = resolverCaminho(dirRelativo);
  let entradas: import("node:fs").Dirent[];
  try {
    entradas = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const base = dirRelativo.endsWith("/") ? dirRelativo : `${dirRelativo}/`;
  const arquivos = entradas.filter((d) => d.isFile());
  return Promise.all(
    arquivos.map(async (d) => ({
      caminho: `${base}${d.name}`,
      modificadoEm: (await fs.stat(path.join(dir, d.name))).mtime,
    })),
  );
}
