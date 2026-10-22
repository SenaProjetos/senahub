import { describe, expect, it } from "vitest";
import { ehDocumento, parseModeloId, refDocumento, refUpload, serieDoModelo } from "@/modules/coordenacao/modelo-ref";

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

  it("série: a revisão nova do mesmo arquivo cai na mesma série", () => {
    const r00 = serieDoModelo({ tipo: "upload", disciplinaId: "disc1", nomeArquivo: "2631-ARQ-BS-IFC.ifc" });
    const r01 = serieDoModelo({ tipo: "upload", disciplinaId: "disc1", nomeArquivo: "2631-arq-bs-ifc.IFC" });
    expect(r00).toBe(r01);
    expect(serieDoModelo({ tipo: "upload", disciplinaId: "disc2", nomeArquivo: "2631-ARQ-BS-IFC.ifc" })).not.toBe(r00);
    expect(serieDoModelo({ tipo: "documento", documentoId: "doc1" })).toBe("d:doc1");
  });
});
