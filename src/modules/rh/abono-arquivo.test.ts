import { describe, expect, it } from "vitest";
import { lerFormularioLimitado } from "@/modules/rh/abono-arquivo";

/** Corpo multipart pronto (bytes + content-type), montado pelo próprio `Request`. */
async function multipart(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  const r = new Request("http://x/", { method: "POST", body: fd });
  return { bytes: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get("content-type")! };
}

/** Envio em partes: corpo em stream, SEM `Content-Length`. */
function emPartes(bytes: Uint8Array, tipo: string, pedaco = 64) {
  let pos = 0;
  const corpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (pos >= bytes.byteLength) return c.close();
      c.enqueue(bytes.slice(pos, pos + pedaco));
      pos += pedaco;
    },
  });
  return new Request("http://x/", {
    method: "POST",
    body: corpo,
    headers: { "content-type": tipo },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("lerFormularioLimitado", () => {
  it("lê o formulário enviado em partes, sem Content-Length", async () => {
    const { bytes, tipo } = await multipart({ dataInicio: "2026-11-17", motivo: "consulta" });
    const r = await lerFormularioLimitado(emPartes(bytes, tipo), 10_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.form.get("motivo")).toBe("consulta");
  });

  it("para de ler quando o corpo em partes passa do teto", async () => {
    const { bytes, tipo } = await multipart({ motivo: "x".repeat(5_000) });
    expect(await lerFormularioLimitado(emPartes(bytes, tipo), 1_000)).toEqual({ ok: false, motivo: "grande" });
  });

  it("recusa pelo Content-Length declarado, antes de ler", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "abc",
      headers: { "content-length": "999999", "content-type": "multipart/form-data; boundary=x" },
    });
    expect(await lerFormularioLimitado(req, 1_000)).toEqual({ ok: false, motivo: "grande" });
  });

  it("envio interrompido no meio é inválido, não erro", async () => {
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(10));
        c.error(new Error("conexão caiu"));
      },
    });
    const req = new Request("http://x/", {
      method: "POST",
      body: corpo,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await lerFormularioLimitado(req, 1_000)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("corpo que não é multipart é inválido, não erro", async () => {
    const req = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(await lerFormularioLimitado(req, 1_000)).toEqual({ ok: false, motivo: "invalido" });
  });
});
