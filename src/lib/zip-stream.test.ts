import { createReadStream, promises as fs, type ReadStream } from "node:fs";
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
    const zip = await lerTudo(
      zipEmStream([
        { caminho: path.join(dir, "a.txt"), nome: "Pasta/Memória A.txt" },
        { caminho: path.join(dir, "grande.bin"), nome: "Pasta/grande.bin" },
        { caminho: path.join(dir, "a.txt"), nome: "Outra/A de novo.txt" },
      ]),
    );
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    for (const nome of ["Pasta/Memória A.txt", "Pasta/grande.bin", "Outra/A de novo.txt"]) {
      expect(zip.includes(Buffer.from(nome)), nome).toBe(true);
    }
    expect(zip.length).toBeGreaterThan(8 * 1024 * 1024);
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


  it("cancelar fecha o arquivo que estava sendo lido e não abre os seguintes", async () => {
    const abertos: ReadStream[] = [];
    const abrir = (p: string) => {
      const rs = createReadStream(p);
      abertos.push(rs);
      return rs;
    };
    const grande = path.join(dir, "grande.bin");
    const leitor = zipEmStream(
      [
        { caminho: grande, nome: "1.bin" },
        { caminho: grande, nome: "2.bin" },
      ],
      abrir,
    ).getReader();
    await leitor.read();
    await leitor.cancel();
    await new Promise((r) => setTimeout(r, 300));
    expect(abertos.length).toBe(1);
    // Aberto e parado no meio prenderia o arquivo no Windows (renomear, substituir, lixeira) até reiniciar o servidor.
    expect(abertos.every((rs) => rs.destroyed)).toBe(true);
  });
});
