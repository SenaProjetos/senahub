import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// STORAGE_BASE_PATH precisa existir antes de importar o módulo (resolverCaminho lê o env).
const TMP = path.join(os.tmpdir(), `senahub-chunks-test-${Date.now()}`);
process.env.STORAGE_BASE_PATH = TMP;

const { guardarChunk, montarChunksEm, limparChunks, limparChunksOrfaos } = await import("./upload-chunks");

beforeAll(async () => {
  await fs.mkdir(TMP, { recursive: true });
});
afterAll(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

describe("upload-chunks", () => {
  it("remonta os pedaços em ordem, byte a byte, com hash e tamanho corretos", async () => {
    const userId = "user123";
    const sessaoId = "sess456abc";
    // 3 pedaços de tamanhos diferentes (o último costuma ser menor).
    const partes = [
      Buffer.from("A".repeat(1000) + "linha 1\n"),
      Buffer.from("B".repeat(500) + "linha 2\n"),
      Buffer.from("fim"),
    ];
    const total = partes.length;
    const original = Buffer.concat(partes);
    const hashEsperado = createHash("sha256").update(original).digest("hex");

    for (let i = 0; i < total; i++) {
      await guardarChunk({ userId, sessaoId, indice: i, total, chunk: partes[i] });
    }

    const destino = "destino/arquivo-remontado.bin";
    const salvo = await montarChunksEm(destino, { userId, sessaoId, total });

    expect(salvo.caminho).toBe(destino);
    expect(salvo.tamanho).toBe(original.length);
    expect(salvo.hashSha256).toBe(hashEsperado);

    const gravado = await fs.readFile(path.join(TMP, destino));
    expect(gravado.equals(original)).toBe(true);

    // A sessão de chunks deve ter sido apagada após montar.
    await expect(fs.access(path.join(TMP, ".chunks", userId, sessaoId))).rejects.toThrow();
  });

  it("lança quando falta um pedaço", async () => {
    const userId = "u2";
    const sessaoId = "sfalta";
    await guardarChunk({ userId, sessaoId, indice: 0, total: 3, chunk: Buffer.from("x") });
    await guardarChunk({ userId, sessaoId, indice: 2, total: 3, chunk: Buffer.from("z") });
    // Falta o índice 1.
    await expect(montarChunksEm("d/x.bin", { userId, sessaoId, total: 3 })).rejects.toThrow();
    await limparChunks(userId, sessaoId);
  });

  it("rejeita índice/total inválidos (guarda anti-abuso)", async () => {
    await expect(
      guardarChunk({ userId: "u", sessaoId: "s", indice: 5, total: 3, chunk: Buffer.from("x") }),
    ).rejects.toThrow();
    await expect(
      guardarChunk({ userId: "u", sessaoId: "s", indice: 0, total: 99999, chunk: Buffer.from("x") }),
    ).rejects.toThrow();
  });

  it("barra identificadores com traversal de caminho", async () => {
    await expect(
      guardarChunk({ userId: "../evil", sessaoId: "s", indice: 0, total: 1, chunk: Buffer.from("x") }),
    ).rejects.toThrow();
  });

  it("limparChunksOrfaos remove sessões antigas e preserva as recentes", async () => {
    const userId = "uorf";
    await guardarChunk({ userId, sessaoId: "velha", indice: 0, total: 1, chunk: Buffer.from("v") });
    await guardarChunk({ userId, sessaoId: "nova", indice: 0, total: 1, chunk: Buffer.from("n") });
    // Envelhece a sessão "velha" mexendo no mtime do diretório.
    const dirVelha = path.join(TMP, ".chunks", userId, "velha");
    const antigo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await fs.utimes(dirVelha, antigo, antigo);

    const removidas = await limparChunksOrfaos(6 * 60 * 60 * 1000);
    expect(removidas).toBeGreaterThanOrEqual(1);
    await expect(fs.access(dirVelha)).rejects.toThrow();
    await expect(fs.access(path.join(TMP, ".chunks", userId, "nova"))).resolves.toBeUndefined();
  });
});
