import { describe, it, expect } from "vitest";
import { svgRecalqueFatias } from "./recalque-fatias";

describe("svgRecalqueFatias", () => {
  it("gera <svg> com uma barra por fatia", () => {
    const svg = svgRecalqueFatias([
      { rhoMm: 3.2, dSigmaKpa: 80 },
      { rhoMm: 1.1, dSigmaKpa: 40 },
    ]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain("3,2"); // rótulo pt-BR do maior recalque
  });

  it("não quebra com lista vazia", () => {
    const svg = svgRecalqueFatias([]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("NaN");
  });

  it("não quebra com recalques todos nulos", () => {
    const svg = svgRecalqueFatias([{ rhoMm: 0, dSigmaKpa: 0 }]);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});
