import { describe, it, expect } from "vitest";
import { calcularINSS, calcularIRRF, calcularEncargos, type Faixa } from "./encargos";

// Faixas-exemplo (NÃO são as oficiais — só para validar a matemática do motor).
const INSS: Faixa[] = [
  { limite: 1000, aliquota: 7.5, deduzir: 0 },
  { limite: 2000, aliquota: 9, deduzir: 0 },
  { limite: 3000, aliquota: 12, deduzir: 0 }, // teto = 3000
];
const IRRF: Faixa[] = [
  { limite: 2000, aliquota: 0, deduzir: 0 },
  { limite: 3000, aliquota: 15, deduzir: 300 },
  { limite: Infinity, aliquota: 27.5, deduzir: 675 },
];

describe("encargos — estrutura vazia", () => {
  it("retorna 0 sem faixas", () => {
    expect(calcularINSS(5000, [])).toBe(0);
    expect(calcularIRRF(5000, [])).toBe(0);
  });
  it("retorna 0 para base <= 0", () => {
    expect(calcularINSS(0, INSS)).toBe(0);
    expect(calcularIRRF(-10, IRRF)).toBe(0);
  });
});

describe("INSS progressivo (marginal)", () => {
  it("dentro da 1ª faixa", () => {
    expect(calcularINSS(800, INSS)).toBe(60); // 800 * 7.5%
  });
  it("atravessa faixas", () => {
    // 1000*7.5% + 500*9% = 75 + 45 = 120
    expect(calcularINSS(1500, INSS)).toBe(120);
  });
  it("acima do teto usa o teto", () => {
    // 1000*7.5 + 1000*9 + 1000*12 = 75+90+120 = 285
    expect(calcularINSS(5000, INSS)).toBe(285);
    expect(calcularINSS(3000, INSS)).toBe(285);
  });
});

describe("IRRF (alíquota − parcela a deduzir)", () => {
  it("isento na 1ª faixa", () => {
    expect(calcularIRRF(1800, IRRF)).toBe(0);
  });
  it("faixa intermediária", () => {
    // 2500*15% - 300 = 375 - 300 = 75
    expect(calcularIRRF(2500, IRRF)).toBe(75);
  });
  it("faixa superior", () => {
    // 5000*27.5% - 675 = 1375 - 675 = 700
    expect(calcularIRRF(5000, IRRF)).toBe(700);
  });
  it("clampa em 0 quando parcela supera o imposto", () => {
    // 5000*10% - 1000 = -500 -> 0
    expect(calcularIRRF(5000, [{ limite: Infinity, aliquota: 10, deduzir: 1000 }])).toBe(0);
  });
});

describe("calcularEncargos (proventos -> INSS, base, IRRF)", () => {
  it("encadeia INSS e IRRF", () => {
    const r = calcularEncargos(5000, INSS, IRRF);
    expect(r.inss).toBe(285);
    expect(r.baseIrrf).toBe(4715); // 5000 - 285
    // 4715*27.5% - 675 = 1296.625 - 675 = 621.63 (round2)
    expect(r.irrf).toBe(621.63);
  });
});
