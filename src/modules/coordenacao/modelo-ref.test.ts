import { describe, expect, it } from "vitest";
import { ehDocumento, parseModeloId, refDocumento, refUpload } from "@/modules/coordenacao/modelo-ref";

describe("modelo-ref", () => {
  it("upload = chave crua (sem prefixo, retrocompat)", () => {
    expect(refUpload("upl_123")).toBe("upl_123");
    expect(parseModeloId("upl_123")).toEqual({ tipo: "upload", id: "upl_123" });
    expect(ehDocumento("upl_123")).toBe(false);
  });

  it("documento = prefixo d:", () => {
    expect(refDocumento("ver_9")).toBe("d:ver_9");
    expect(parseModeloId("d:ver_9")).toEqual({ tipo: "documento", id: "ver_9" });
    expect(ehDocumento("d:ver_9")).toBe(true);
  });

  it("round-trip", () => {
    const u = refUpload("A");
    const d = refDocumento("B");
    expect(parseModeloId(u).id).toBe("A");
    expect(parseModeloId(d).id).toBe("B");
  });

  it("id de documento com dois-pontos internos é preservado", () => {
    // slice só remove o primeiro prefixo — cuid nunca tem ':' mas garantimos o comportamento.
    expect(parseModeloId("d:a:b")).toEqual({ tipo: "documento", id: "a:b" });
  });
});
