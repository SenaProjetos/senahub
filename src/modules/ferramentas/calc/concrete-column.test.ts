import { describe, it, expect } from "vitest";
import { calcular, secaoNM, momentoResistente, efeitoDirecao } from "./concrete-column";
import { parametrosConcreto } from "./concrete-beam-flexure";

// Config base hand-check: 20×40, fck=25, CA-50, d'=4, As=20 (10 por face).
const p = parametrosConcreto(25); // lambda=0.8, alphaC=0.85, epsCU=3.5‰
const fcd = 25 / 10 / 1.4; // 1.7857 kN/cm²
const fyd = 500 / 10 / 1.15; // 43.478 kN/cm²
const sigmaCd = p.alphaC * fcd; // 1.5179 kN/cm²

describe("E04 — seção N-M (integração do bloco retangular)", () => {
  // x=20 (=H/2): ambas as armaduras escoadas (compr./tração), N=485.7, M=197.4 kN·m
  it("x = 20 cm → N ≈ 485.7 kN, M ≈ 19741 kN·cm", () => {
    const { N, M } = secaoNM(20, 20, 20, 40, 4, sigmaCd, fyd, p);
    expect(N).toBeCloseTo(485.7, 0);
    expect(M).toBeCloseTo(19741, -1); // ~197.4 kN·m
  });

  // x=30: armadura inferior na fase elástica (σ≈-14.7), N=1016.4, M=15137 kN·cm
  it("x = 30 cm → N ≈ 1016.4 kN, M ≈ 15137 kN·cm", () => {
    const { N, M } = secaoNM(30, 20, 20, 40, 4, sigmaCd, fyd, p);
    expect(N).toBeCloseTo(1016.4, 0);
    expect(M).toBeCloseTo(15137, -1);
  });
});

describe("E04 — momento resistente uniaxial a Nd", () => {
  it("inverte: a Nd=485.7 kN devolve M ≈ 197.4 kN·m (x≈20)", () => {
    const M = momentoResistente(485.7, 20, 20, 40, 4, sigmaCd, fyd, p);
    expect(M).toBeCloseTo(19741, -2);
  });
  it("Nd acima da capacidade total comprimida → 0", () => {
    const Nmax = secaoNM(5 * 40, 20, 20, 40, 4, sigmaCd, fyd, p).N;
    expect(momentoResistente(Nmax + 100, 20, 20, 40, 4, sigmaCd, fyd, p)).toBe(0);
  });
});

describe("E04 — esbeltez e 2ª ordem (pilar-padrão)", () => {
  // Pilar 20×40, le=280 cm na direção de h=40. Ac=800, fcd=1.7857. Nd=600.
  const Ac = 800;
  const dir = efeitoDirecao(40, 280, 0, 600, Ac, fcd, 1);
  it("λ = 280·√12/40 ≈ 24.25", () => expect(dir.lambda).toBeCloseTo(24.25, 1));
  it("ν = Nd/(Ac·fcd) ≈ 0.42", () => expect(dir.nu).toBeCloseTo(0.42, 2));
  it("M1d,mín = Nd·(1.5+0.03·40) = 600·2.7 = 1620 kN·cm", () =>
    expect(dir.m1dMin).toBeCloseTo(1620, 0));
  it("λ ≤ λ1 → não esbelto, sem 2ª ordem", () => {
    expect(dir.esbelto).toBe(false);
    expect(dir.m2d).toBe(0);
    expect(dir.mdTot).toBeCloseTo(1620, 0); // governado pelo mínimo
  });

  it("pilar esbelto (le grande) gera M2d > 0", () => {
    const d2 = efeitoDirecao(20, 400, 0, 600, Ac, fcd, 1); // λ=400·√12/20≈69.3 > λ1
    expect(d2.lambda).toBeCloseTo(69.28, 1);
    expect(d2.esbelto).toBe(true);
    expect(d2.m2d).toBeGreaterThan(0);
  });
});

describe("E04 — dimensionamento biaxial", () => {
  it("caso leve: armadura mínima governa", () => {
    const r = calcular({
      b: 20, h: 40, fck: 25, aco: "CA-50", dLinha: 4,
      Nd: 400, Mdx: 10, Mdy: 5, lex: 280, ley: 280,
    });
    expect(r.As).toBeCloseTo(r.AsMin, 5);
    expect(r.interacao).toBeLessThanOrEqual(1.0001);
    expect(r.viavel).toBe(true);
  });

  it("caso pesado: interação fica ≈ 1 no As dimensionado", () => {
    const r = calcular({
      b: 20, h: 40, fck: 25, aco: "CA-50", dLinha: 4,
      Nd: 1500, Mdx: 120, Mdy: 40, lex: 280, ley: 280,
      alphaInteracao: 1,
    });
    if (r.viavel && r.AsNec > r.AsMin) {
      expect(r.interacao).toBeCloseTo(1, 1);
    }
    expect(r.As).toBeGreaterThanOrEqual(r.AsMin);
  });

  it("As,mín = max(0.4% Ac, 0.15·Nd/fyd)", () => {
    const r = calcular({
      b: 20, h: 40, fck: 25, aco: "CA-50",
      Nd: 800, lex: 280, ley: 280,
    });
    const esperado = Math.max(0.004 * 800, (0.15 * 800) / fyd);
    expect(r.AsMin).toBeCloseTo(esperado, 3);
  });
});
