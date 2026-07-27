import { describe, it, expect } from "vitest";
import { svgTensaoSolo } from "./tensao-solo";

describe("svgTensaoSolo", () => {
  it("desenha diagrama trapezoidal com σmax/σmin quando não descola", () => {
    const svg = svgTensaoSolo({ a: 240, sigmaMax: 280, sigmaMin: 60, descola: false });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("280"); // rótulo σmax
    expect(svg).toContain("60"); // rótulo σmin
    expect(svg).toContain("<polygon");
  });

  it("desenha triangular (σmin=0) quando descola", () => {
    const svg = svgTensaoSolo({ a: 240, sigmaMax: 400, sigmaMin: 0, descola: true });
    expect(svg).toContain("<polygon"); // triângulo de contato
    expect(svg).toContain("400");
  });

  it("não quebra com σmax = 0 (evita divisão por zero na escala)", () => {
    const svg = svgTensaoSolo({ a: 100, sigmaMax: 0, sigmaMin: 0, descola: false });
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});
