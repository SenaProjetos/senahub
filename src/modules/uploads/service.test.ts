import { describe, it, expect } from "vitest";
import { destinoArquivo, extensao, EXT_PACOTE_A } from "@/modules/uploads/service";

describe("classificação de upload por pacote", () => {
  it("extrai extensão em minúsculas", () => {
    expect(extensao("Planta.PDF")).toBe("pdf");
    expect(extensao("backup")).toBe("");
  });

  it("Pranchas e arquivos (A) aceita formatos de planta/memorial", () => {
    expect(destinoArquivo("planta.dwg", "A")).toBe("A");
    expect(destinoArquivo("memorial.pdf", "A")).toBe("A");
    expect(destinoArquivo("modelo.ifc", "A")).toBe("A");
  });

  it("formato não suportado em Pranchas e arquivos vai para OUTROS (não falha o lote)", () => {
    expect(destinoArquivo("arquivo.zip", "A")).toBe("OUTROS");
    expect(destinoArquivo("notas.txt", "A")).toBe("OUTROS");
  });

  it("Backup do modelo (B) aceita qualquer formato", () => {
    expect(destinoArquivo("backup.zip", "B")).toBe("B");
    expect(destinoArquivo("dump.bak", "B")).toBe("B");
    expect(destinoArquivo("qualquer.xyz", "B")).toBe("B");
  });

  it("catálogo de extensões de Pranchas e arquivos inclui os principais formatos BIM", () => {
    for (const ext of ["pdf", "dwg", "dxf", "ifc", "rvt"]) {
      expect(EXT_PACOTE_A.has(ext)).toBe(true);
    }
  });
});
