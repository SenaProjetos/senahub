import { describe, it, expect } from "vitest";
import { calcular } from "./load-descent";

describe("E12 — Descida de cargas (NBR 6120:2019)", () => {
  // Hand-check: 3 pavimentos do topo à base.
  // Cobertura: A=20, g=5, q=1, extra=0  → Ng=100, Nq=20
  // Tipo:      A=25, g=6, q=2, extra=10 → Ng=160, Nq=50
  // Térreo:    A=25, g=6, q=3, extra=10 → Ng=160, Nq=75
  const entrada = {
    pavimentos: [
      { nome: "Cobertura", area: 20, g: 5, q: 1, extra: 0 },
      { nome: "Tipo", area: 25, g: 6, q: 2, extra: 10 },
      { nome: "Térreo", area: 25, g: 6, q: 3, extra: 10 },
    ],
  };

  it("carga de cada piso", () => {
    const r = calcular(entrada);
    expect(r.niveis[0].ngPiso).toBeCloseTo(100, 6);
    expect(r.niveis[0].nqPiso).toBeCloseTo(20, 6);
    expect(r.niveis[1].ngPiso).toBeCloseTo(160, 6);
    expect(r.niveis[1].nqPiso).toBeCloseTo(50, 6);
    expect(r.niveis[2].ngPiso).toBeCloseTo(160, 6);
    expect(r.niveis[2].nqPiso).toBeCloseTo(75, 6);
  });

  it("acumula do topo à base", () => {
    const r = calcular(entrada);
    expect(r.niveis[0].nAcum).toBeCloseTo(120, 6); // 100+20
    expect(r.niveis[1].nAcum).toBeCloseTo(330, 6); // +210
    expect(r.niveis[2].nAcum).toBeCloseTo(565, 6); // +235
  });

  it("totais na base (sem redução)", () => {
    const r = calcular(entrada);
    expect(r.ngTotal).toBeCloseTo(420, 6); // 100+160+160
    expect(r.nqTotal).toBeCloseTo(145, 6); // 20+50+75
    expect(r.fator).toBe(1);
    expect(r.nqReduzido).toBeCloseTo(145, 6);
    expect(r.nTotal).toBeCloseTo(565, 6);
  });

  it("aplica fator de redução só na acidental", () => {
    const r = calcular({ ...entrada, fatorReducaoSobrecarga: 0.8 });
    expect(r.ngTotal).toBeCloseTo(420, 6); // permanente intacta
    expect(r.nqTotal).toBeCloseTo(145, 6); // acumulada bruta intacta
    expect(r.nqReduzido).toBeCloseTo(116, 6); // 145 × 0.8
    expect(r.nTotal).toBeCloseTo(536, 6); // 420 + 116
  });

  it("extra default = 0 quando omitido", () => {
    const r = calcular({ pavimentos: [{ nome: "P1", area: 10, g: 5, q: 2 }] });
    expect(r.niveis[0].ngPiso).toBeCloseTo(50, 6); // 10×5, sem extra
    expect(r.niveis[0].nqPiso).toBeCloseTo(20, 6);
  });

  it("um único pavimento", () => {
    const r = calcular({ pavimentos: [{ nome: "Único", area: 30, g: 7, q: 2.5, extra: 5 }] });
    expect(r.ngTotal).toBeCloseTo(215, 6); // 30×7 + 5
    expect(r.nqTotal).toBeCloseTo(75, 6); // 30×2.5
    expect(r.nTotal).toBeCloseTo(290, 6);
  });
});
