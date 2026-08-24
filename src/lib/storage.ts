import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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

/** Salva um buffer em `relativo` (criando diretórios). Retorna hash SHA-256 e tamanho. */
export async function salvarArquivo(relativo: string, conteudo: Buffer): Promise<ArquivoSalvo> {
  const full = resolverCaminho(relativo);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, conteudo);
  const hashSha256 = createHash("sha256").update(conteudo).digest("hex");
  return { caminho: relativo, hashSha256, tamanho: conteudo.length };
}

export async function lerArquivo(relativo: string): Promise<Buffer> {
  return fs.readFile(resolverCaminho(relativo));
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

/** Remove um arquivo do disco. Best-effort: ignora se já não existe. */
export async function removerArquivo(relativo: string): Promise<void> {
  try {
    await fs.unlink(resolverCaminho(relativo));
  } catch {
    /* já removido */
  }
}

/** Move um arquivo entre dois caminhos relativos (cria diretórios do destino). */
export async function moverArquivo(relativoDe: string, relativoPara: string): Promise<void> {
  const de = resolverCaminho(relativoDe);
  const para = resolverCaminho(relativoPara);
  await fs.mkdir(path.dirname(para), { recursive: true });
  await fs.rename(de, para);
}
