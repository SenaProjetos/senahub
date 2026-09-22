import { describe, expect, it } from "vitest";
import { caminhoNoZip } from "./estrutura";

describe("caminhoNoZip", () => {
  it("sem sub (padrão v1): caminho de sempre", () => {
    expect(caminhoNoZip("A", "260018-EST-EX-4001-DET.pdf")).toBe("Pranchas e arquivos/PDF/260018-EST-EX-4001-DET.pdf");
  });

  it("com sub (F5, padrão v2): pasta extra entre o pacote e a subpasta por extensão", () => {
    expect(caminhoNoZip("A", "260010-SENA-AGF-BAS-001-PLB.pdf", "Água Fria")).toBe(
      "Pranchas e arquivos/Água Fria/PDF/260010-SENA-AGF-BAS-001-PLB.pdf",
    );
  });

  it("sub null/undefined não muda o caminho", () => {
    const base = caminhoNoZip("B", "modelo.rvt");
    expect(caminhoNoZip("B", "modelo.rvt", null)).toBe(base);
    expect(caminhoNoZip("B", "modelo.rvt", undefined)).toBe(base);
  });
});
