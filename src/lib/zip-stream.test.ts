import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zipEmStream } from "./zip-stream";

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-stream-"));
  await fs.writeFile(path.join(dir, "a.txt"), "conteúdo A");
  // Grande e aleatório (não comprime): força várias voltas de leitura com backpressure.
  await fs.writeFile(path.join(dir, "grande.bin"), randomBytes(8 * 1024 * 1024));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function lerTudo(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const partes: Buffer[] = [];
  const leitor = stream.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(Buffer.from(value));
  }
  return Buffer.concat(partes);
}

describe("zipEmStream", () => {
  it("monta um .zip com os arquivos, nos nomes pedidos", async () => {
    const zip = await lerTudo(zipEmStream([{ caminho: path.join(dir, "a.txt"), nome: "Pasta/Memória A.txt" }]));
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes(Buffer.from("Pasta/Memória A.txt"))).toBe(true);
  });

  it("cancelar no meio encerra sem erro solto e sem ler o resto", async () => {
    const erros: unknown[] = [];
    const pegar = (e: unknown) => erros.push(e);
    process.on("uncaughtException", pegar);
    process.on("unhandledRejection", pegar);
    try {
      const stream = zipEmStream([{ caminho: path.join(dir, "grande.bin"), nome: "grande.bin" }]);
      const leitor = stream.getReader();
      const primeiro = await leitor.read();
      expect(primeiro.done).toBe(false);
      await leitor.cancel();
      await new Promise((r) => setTimeout(r, 300));
      expect(erros).toEqual([]);
    } finally {
      process.off("uncaughtException", pegar);
      process.off("unhandledRejection", pegar);
    }
  });

});
