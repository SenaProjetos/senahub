import { describe, expect, it } from "vitest";
import { lerJsonLimitado } from "./corpo-limitado";

/** Corpo em pedaços, sem Content-Length (como um envio chunked). */
function reqEmPedacos(pedacos: string[], headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  let i = 0;
  let puxados = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= pedacos.length) return c.close();
      puxados += 1;
      c.enqueue(enc.encode(pedacos[i++]));
    },
  }, { highWaterMark: 0 });
  const req = new Request("http://localhost/x", {
    method: "PUT",
    body: stream,
    headers,
    // @ts-expect-error — obrigatório no Node para corpo em stream
    duplex: "half",
  });
  return { req, puxados: () => puxados };
}

describe("lerJsonLimitado", () => {
  it("lê um JSON dentro do limite", async () => {
    const { req } = reqEmPedacos(['{"a":', "1}"]);
    expect(await lerJsonLimitado(req, 100)).toEqual({ ok: true, dados: { a: 1 } });
  });

  it("corpo em stream acima do limite (sem Content-Length) = 413 e para de ler", async () => {
    const { req, puxados } = reqEmPedacos(Array.from({ length: 50 }, () => "x".repeat(100)));
    expect(await lerJsonLimitado(req, 250)).toEqual({ ok: false, status: 413, erro: "Respostas grandes demais." });
    expect(puxados()).toBeLessThan(50);
  });

  it("Content-Length acima do limite = 413 sem ler", async () => {
    const { req, puxados } = reqEmPedacos(['{"a":1}'], { "content-length": "999999" });
    expect(await lerJsonLimitado(req, 100)).toMatchObject({ ok: false, status: 413 });
    expect(puxados()).toBe(0);
  });

  it("JSON inválido = 400", async () => {
    const { req } = reqEmPedacos(["{nao json"]);
    expect(await lerJsonLimitado(req, 100)).toEqual({ ok: false, status: 400, erro: "Dados inválidos." });
  });

  it("corpo vazio = 400", async () => {
    const req = new Request("http://localhost/x", { method: "PUT" });
    expect(await lerJsonLimitado(req, 100)).toMatchObject({ ok: false, status: 400 });
  });

  it("conta bytes, não caracteres", async () => {
    // 60 "é" = 120 bytes em UTF-8.
    const { req } = reqEmPedacos(['"' + "é".repeat(60) + '"']);
    expect(await lerJsonLimitado(req, 100)).toMatchObject({ ok: false, status: 413 });
  });
});
