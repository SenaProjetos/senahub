import { describe, expect, it } from "vitest";
import { arquivosDaRevisaoAtual, revisaoAtualDosUploads } from "./documentos-agrupados-utils";

describe("arquivosDaRevisaoAtual", () => {
  it("mantém a R01 disponível quando uma R02 já não tem upload ativo", () => {
    const uploads = [
      { id: "r01-pdf", revisaoId: "r01", revisao: { numero: 1 } },
      { id: "r01-dwg", revisaoId: "r01", revisao: { numero: 1 } },
    ];

    expect(revisaoAtualDosUploads(uploads)).toBe(1);
    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["r01-pdf", "r01-dwg"]);
  });

  it("usa a maior revisão que ainda possui upload ativo", () => {
    const uploads = [
      { id: "r01", revisaoId: "r01", revisao: { numero: 1 } },
      { id: "r02", revisaoId: "r02", revisao: { numero: 2 } },
    ];

    expect(revisaoAtualDosUploads(uploads)).toBe(2);
    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["r02"]);
  });

  it("preserva uploads legados sem revisão ao lado da revisão vigente", () => {
    const uploads = [
      { id: "legado", revisaoId: null, revisao: null },
      { id: "r02", revisaoId: "r02", revisao: { numero: 2 } },
      { id: "r01", revisaoId: "r01", revisao: { numero: 1 } },
    ];

    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["legado", "r02"]);
  });
});
