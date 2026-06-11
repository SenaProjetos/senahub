import { describe, it, expect } from "vitest";
import { destinoArquivo, extensao, EXT_PACOTE_A } from "@/modules/uploads/service";

describe("classificação de upload por pacote", () => {
  it("extrai extensão em minúsculas", () => {
    expect(extensao("Planta.PDF")).toBe("pdf");
    expect(extensao("backup")).toBe("");
  });

  it("Pacote A aceita formatos de planta/memorial", () => {
    expect(destinoArquivo("planta.dwg", "A")).toBe("A");
    expect(destinoArquivo("memorial.pdf", "A")).toBe("A");
    expect(destinoArquivo("modelo.ifc", "A")).toBe("A");
  });

  it("formato não suportado no Pacote A vai para OUTROS (não falha o lote)", () => {
    expect(destinoArquivo("arquivo.zip", "A")).toBe("OUTROS");
    expect(destinoArquivo("notas.txt", "A")).toBe("OUTROS");
  });

  it("Pacote B (backup) aceita qualquer formato", () => {
    expect(destinoArquivo("backup.zip", "B")).toBe("B");
    expect(destinoArquivo("dump.bak", "B")).toBe("B");
    expect(destinoArquivo("qualquer.xyz", "B")).toBe("B");
  });

  it("catálogo de extensões do Pacote A inclui os principais formatos BIM", () => {
    for (const ext of ["pdf", "dwg", "dxf", "ifc", "rvt"]) {
      expect(EXT_PACOTE_A.has(ext)).toBe(true);
    }
  });
});
