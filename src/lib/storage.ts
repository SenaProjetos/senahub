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

/**
 * Extensão do nome enviado pelo cliente, só se for simples (`.pdf`, `.ifc`: letras e dígitos, até 10), em
 * minúsculas. Qualquer outra coisa vira "" — `.pdf:x` abriria um stream NTFS e caractere inválido daria erro
 * do Windows no meio da gravação.
 */
export function extensaoSegura(nome: string): string {
  const i = nome.lastIndexOf(".");
  if (i < 0) return "";
  const ext = nome.slice(i);
  return /^\.[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : "";
}

/**
 * Passa o stream adiante e erra com "Arquivo acima do limite." quando passar de `limite` bytes. Para o corpo
 * de um pedido sem `Content-Length` (chunked), que de outro modo seria lido inteiro antes de qualquer teto.
 */
export function limitarStream(origem: ReadableStream<Uint8Array>, limite: number): ReadableStream<Uint8Array> {
  let total = 0;
  return origem.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > limite) controller.error(new Error("Arquivo acima do limite."));
        else controller.enqueue(chunk);
      },
    }),
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

/**
 * Igual a `salvarArquivo`, mas lendo de um stream (ex.: `File.stream()` de um upload): grava em pedaços, com
 * hash e tamanho calculados no caminho, sem juntar o arquivo inteiro num Buffer. `limite` (bytes) para no
 * meio quem passar dele ("Arquivo acima do limite."). Falhou → nem o temporário nem o destino ficam.
 */
export async function salvarStream(
  relativo: string,
  conteudo: ReadableStream<Uint8Array>,
  opcoes: { limite?: number } = {},
): Promise<ArquivoSalvo> {
  const full = resolverCaminho(relativo);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const temporario = `${full}.${randomBytes(6).toString("hex")}${SUFIXO_GRAVACAO_PARCIAL}`;
  const hash = createHash("sha256");
  let tamanho = 0;
  const contador = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      tamanho += chunk.length;
      if (opcoes.limite !== undefined && tamanho > opcoes.limite) {
        cb(new Error("Arquivo acima do limite."));
        return;
      }
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    const origem = Readable.fromWeb(conteudo as import("node:stream/web").ReadableStream);
    await pipeline(origem, contador, createWriteStream(temporario, { flags: "wx" }));
    await renomearComEspera(temporario, full);
  } catch (erro) {
    await fs.rm(temporario, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    throw erro;
  }
  return { caminho: relativo, hashSha256: hash.digest("hex"), tamanho };
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
  const eArquivo = async (item: T) => {
    try {
      return (await fs.stat(resolverCaminho(item.caminho))).isFile();
    } catch {
      return false;
    }
  };
  // Em lotes de 16: uma pasta grande (ou o disco em rede) não vira centenas de `stat` em fila.
  const existe: boolean[] = [];
  for (let i = 0; i < itens.length; i += 16) {
    existe.push(...(await Promise.all(itens.slice(i, i + 16).map(eArquivo))));
  }
  return {
    presentes: itens.filter((_, i) => existe[i]),
    ausentes: itens.filter((_, i) => !existe[i]),
  };
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
 * caminho. Grava num temporário ao lado e só renomeia no fim (como `salvarArquivo`): falhou no meio → o temporário sai,
 * e um destino que já existia fica intacto. Relança o erro.
 */
export async function copiarArquivo(relativoDe: string, relativoPara: string): Promise<ArquivoSalvo> {
  const de = resolverCaminho(relativoDe);
  const para = resolverCaminho(relativoPara);
  await fs.mkdir(path.dirname(para), { recursive: true });
  const temporario = `${para}.${randomBytes(6).toString("hex")}${SUFIXO_GRAVACAO_PARCIAL}`;
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
    await pipeline(createReadStream(de), contador, createWriteStream(temporario, { flags: "wx" }));
    await renomearComEspera(temporario, para);
  } catch (erro) {
    await fs.rm(temporario, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
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
