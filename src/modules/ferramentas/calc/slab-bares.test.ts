import { describe, it, expect } from "vitest";
import { calcular } from "./slab-bares";

/**
 * Vetores conferidos contra os 3 exemplos resolvidos do material fornecido
 * (Estude Engenharia / tabelas de Bares–Pinheiro): laje 300×450 cm (λ=1,5),
 * p = 6,5 kN/m². M = μ·p·lx²/100, com lx = 3 m → p·lx²/100 = 0,585.
 */
const base = { lx: 300, ly: 450, h: 12, p: 6.5, fck: 25, aco: "CA-50" as const };

function momento(r: ReturnType<typeof calcular>, simbolo: string): number {
  return r.momentos.find((m) => m.simbolo === simbolo)?.m ?? NaN;
}

describe("E05 — Laje maciça (tabelas de Bares)", () => {
  it("Exemplo 1 — Caso 2B, λ=1,5 (μx=5,24; μ'x=11,09; μy=2,12)", () => {
    const r = calcular({ ...base, caso: "2B" });
    expect(r.lambda).toBeCloseTo(1.5, 6);
    expect(momento(r, "Mx")).toBeCloseTo(5.24 * 0.585, 3); // ≈3,065 (PDF: 3,06)
    expect(momento(r, "M'x")).toBeCloseTo(11.09 * 0.585, 3); // ≈6,488 (PDF: 6,49)
    expect(momento(r, "My")).toBeCloseTo(2.12 * 0.585, 3); // ≈1,240 (PDF: 1,24)
  });

  it("Exemplo 2 — Caso 4A, λ=1,5 (μx=5,37; μy=3,90; μ'y=10,49)", () => {
    const r = calcular({ ...base, caso: "4A" });
    expect(momento(r, "Mx")).toBeCloseTo(5.37 * 0.585, 3); // ≈3,141 (PDF: 3,14)
    expect(momento(r, "My")).toBeCloseTo(3.9 * 0.585, 3); // ≈2,282 (PDF: 2,28)
    expect(momento(r, "M'y")).toBeCloseTo(10.49 * 0.585, 3); // ≈6,137 (PDF: 6,14)
  });

  it("Exemplo 3 — Caso 5A, λ=1,5 (μx=4,23; μ'x=9,44; μy=2,43; μ'y=7,91)", () => {
    const r = calcular({ ...base, caso: "5A" });
    expect(momento(r, "Mx")).toBeCloseTo(4.23 * 0.585, 3); // ≈2,475 (PDF: 2,47)
    expect(momento(r, "M'x")).toBeCloseTo(9.44 * 0.585, 3); // ≈5,522 (PDF: 5,52)
    expect(momento(r, "My")).toBeCloseTo(2.43 * 0.585, 3); // ≈1,422 (PDF: 1,42)
    expect(momento(r, "M'y")).toBeCloseTo(7.91 * 0.585, 3); // ≈4,627 (PDF: 4,63)
  });

  it("Caso 1 (4 apoiadas) λ=1,0: Mx=My (simétrico, μ=4,23)", () => {
    const r = calcular({ ...base, lx: 400, ly: 400, caso: "1" });
    expect(r.lambda).toBeCloseTo(1.0, 6);
    // M = 4,23 · 6,5 · 4²/100 = 4,23·1,04 = 4,3992
    expect(momento(r, "Mx")).toBeCloseTo(4.399, 2);
    expect(momento(r, "My")).toBeCloseTo(4.399, 2);
  });

  it("interpola entre pontos da tabela (caso 1, λ=1,025)", () => {
    const r = calcular({ ...base, lx: 400, ly: 410, caso: "1" });
    expect(r.lambda).toBeCloseTo(1.025, 6);
    // μx interpolado entre 4,23 (1,00) e 4,62 (1,05) → 4,425
    const fator = (6.5 * 4 * 4) / 100; // lx=4m
    expect(momento(r, "Mx")).toBeCloseTo(4.425 * fator, 2);
  });

  it("λ > 2 usa a linha \">2,00\" e marca uma direção", () => {
    const r = calcular({ ...base, lx: 300, ly: 700, caso: "1" });
    expect(r.umaDirecao).toBe(true);
    // μx = 12,50; lx=3 → 12,50·0,585 = 7,3125
    expect(momento(r, "Mx")).toBeCloseTo(7.3125, 2);
  });

  describe("Flecha (Tabela 2.5a)", () => {
    // Caso 1, λ=1,0 (α=4,76), lx=ly=4 m, p=5, h=12 cm, fck=25 (Ecs≈24150 MPa).
    // a_i = (4,76/100)·5·4⁴/(24150e3·0,12³) = 0,001460 m = 0,1460 cm
    const r = calcular({ lx: 400, ly: 400, h: 12, p: 5, pServ: 5, fck: 25, aco: "CA-50", caso: "1" });
    it("Ecs ≈ 24150 MPa", () => expect(r.ecs).toBeCloseTo(24150, 0));
    it("flecha imediata ≈ 0,146 cm", () => expect(r.flechaImediata).toBeCloseTo(0.146, 3));
    it("flecha total = imediata·(1+αf)", () =>
      expect(r.flechaTotal).toBeCloseTo(0.146 * (1 + 1.32), 2));
    it("limite L/250 = 1,6 cm", () => expect(r.flechaLimite).toBeCloseTo(1.6, 6));
  });

  it("As,mín de laje (0,67·ρmín·Ac) governa em carga baixa", () => {
    const r = calcular({ lx: 300, ly: 300, h: 12, p: 1, fck: 25, aco: "CA-50", caso: "1" });
    // 0,67·0,0015·(100·12) = 1,206 cm²/m
    expect(r.asMin).toBeCloseTo(1.206, 3);
    expect(r.momentos.every((m) => m.as >= 1.206 - 1e-9)).toBe(true);
  });
});
