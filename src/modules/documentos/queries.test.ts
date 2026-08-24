import { describe, expect, it } from "vitest";
import { escopoDocumentoGerado, type DocumentoGeradoViewer } from "./queries";

function viewer(overrides: Partial<DocumentoGeradoViewer> = {}): DocumentoGeradoViewer {
  return {
    id: "gerador",
    superUsuario: false,
    escopoGlobalPerfil: false,
    ...overrides,
  };
}

describe("escopoDocumentoGerado", () => {
  it("restringe usuário comum aos documentos que gerou", () => {
    expect(escopoDocumentoGerado(viewer())).toEqual({ geradoPorId: "gerador" });
  });

  it("permite histórico completo somente a escopo global", () => {
    expect(escopoDocumentoGerado(viewer({ superUsuario: true }))).toEqual({});
    expect(escopoDocumentoGerado(viewer({ escopoGlobalPerfil: true }))).toEqual({});
  });
});
