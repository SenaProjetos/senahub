import { describe, expect, it } from "vitest";

import { formatosQueFaltam, normalizarFormatosExigidos, resumoDosFormatos } from "./formatos-exigidos";

describe("normalizarFormatosExigidos", () => {
  it("só valores conhecidos, sem repetir, na ordem do catálogo", () => {
    expect(normalizarFormatosExigidos(["pdf", "dwg", "pdf", "lixo", 3])).toEqual(["dwg", "pdf"]);
    expect(normalizarFormatosExigidos(null)).toEqual([]);
    expect(normalizarFormatosExigidos([])).toEqual([]);
  });
});

describe("resumoDosFormatos", () => {
  it("junta com +; vazio é sem exigência", () => {
    expect(resumoDosFormatos(["pdf", "word_ou_excel"])).toBe("PDF + Word ou Excel");
    expect(resumoDosFormatos([])).toBe("Sem exigência");
  });
});

describe("formatosQueFaltam", () => {
  it("cada exigência pede pelo menos um arquivo de uma das extensões dela", () => {
    expect(formatosQueFaltam(["dwg", "pdf"], ["pdf"])).toEqual(["dwg"]);
    expect(formatosQueFaltam(["dwg", "pdf"], ["PDF", "DWG"])).toEqual([]);
    expect(formatosQueFaltam(["excel"], ["xls"])).toEqual([]);
    expect(formatosQueFaltam(["excel"], ["docx"])).toEqual(["excel"]);
    expect(formatosQueFaltam(["word"], ["doc"])).toEqual([]);
  });

  it("Word ou Excel: qualquer um cumpre", () => {
    expect(formatosQueFaltam(["word_ou_excel"], ["docx"])).toEqual([]);
    expect(formatosQueFaltam(["word_ou_excel"], ["xlsm"])).toEqual([]);
    expect(formatosQueFaltam(["word_ou_excel"], ["pdf"])).toEqual(["word_ou_excel"]);
  });

  it("sem exigência, nada falta", () => {
    expect(formatosQueFaltam([], [])).toEqual([]);
  });
});
