import "server-only";
import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";

/**
 * Monta um .zip em stream para a resposta HTTP. `caminho` já resolvido (via `resolverCaminho`) e conferido.
 *
 * O archiver escreve num `PassThrough` por `pipe`, que respeita o ritmo de quem lê: um pacote grande não vai
 * inteiro para a memória quando o cliente baixa devagar. Se o cliente cancela (fechou a aba, caiu a rede), o
 * stream web destrói o `PassThrough` e o archiver é abortado — antes, o `enqueue` seguinte lançava "Controller
 * is already closed" fora de qualquer try, num processo único.
 */
export function zipEmStream(entradas: { caminho: string; nome: string }[]): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const saida = new PassThrough();
  archive.on("warning", (err) => console.warn("[zip] warning:", err));
  archive.on("error", (err) => {
    console.error("[zip] erro no archiver:", err);
    saida.destroy(err);
  });
  // Fechou antes de terminar = cancelado: para de ler os arquivos.
  saida.on("close", () => {
    if (!saida.writableFinished) archive.abort();
  });
  archive.pipe(saida);
  for (const e of entradas) archive.file(e.caminho, { name: e.nome });
  archive.finalize().catch(() => {
    // O erro já chegou pelo evento "error" (ou foi um abort pedido pelo cancelamento).
  });
  return Readable.toWeb(saida) as ReadableStream<Uint8Array>;
}
