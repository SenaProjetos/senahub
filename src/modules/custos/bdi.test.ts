import { describe, expect, it } from "vitest";
import { aplicarBdi, calcularBdi, type EntradaBdi } from "./bdi";

const BASE: EntradaBdi = {
  admCentral: 4,
  seguro: 0.8,
  risco: 0.97,
  garantia: 0.4,
  despesasFinanceiras: 1.15,
  lucro: 7.4,
  pis: 0.65,
  cofins: 3,
  iss: 2,
  cprb: 0,
};

describe("calcularBdi", () => {
  it("cenário de referência (parcelas usuais de obra pública, verificado à mão)", () => {
    const r = calcularBdi(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.percentual).toBeCloseTo(22.24, 2);
    expect(r.multiplicador).toBeCloseTo(1.2224, 4);
    expect(r.tributosTotal).toBe(5.65);
  });

  it("BDI reduzido (equipamentos/materiais): menos AC/S/R/G/DF/L gera percentual bem menor", () => {
    const reduzido = calcularBdi({
      admCentral: 2,
      seguro: 0,
      risco: 0,
      garantia: 0,
      despesasFinanceiras: 0,
      lucro: 0,
      pis: 0.65,
      cofins: 3,
      iss: 2,
      cprb: 0,
    });
    expect(reduzido.ok).toBe(true);
    if (!reduzido.ok) return;
    expect(reduzido.percentual).toBeCloseTo(8.11, 2);

    const padrao = calcularBdi(BASE);
    expect(padrao.ok).toBe(true);
    if (!padrao.ok) return;
    expect(reduzido.percentual).toBeLessThan(padrao.percentual);
  });

  it("tributos zerados: BDI vira só o produto das margens, sem divisão", () => {
    const r = calcularBdi({ ...BASE, pis: 0, cofins: 0, iss: 0, cprb: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tributosTotal).toBe(0);
  });

  it("tributos somando 100% ou mais é erro de negócio (denominador zera/inverte)", () => {
    const r = calcularBdi({ ...BASE, pis: 50, cofins: 30, iss: 15, cprb: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/100%/);
  });

  it("arredonda o percentual final a 2 casas decimais", () => {
    const r = calcularBdi(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Number.isInteger(r.percentual * 100)).toBe(true);
  });

  it("demonstrativo preserva a ordem AC,S,R,G,DF,L,PIS,COFINS,ISS,CPRB", () => {
    const r = calcularBdi(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demonstrativo.map((l) => l.chave)).toEqual([
      "admCentral",
      "seguro",
      "risco",
      "garantia",
      "despesasFinanceiras",
      "lucro",
      "pis",
      "cofins",
      "iss",
      "cprb",
    ]);
  });
});

describe("aplicarBdi", () => {
  it("aplica o percentual sobre o valor sem BDI, arredondado a centavos", () => {
    expect(aplicarBdi(1000, 22.24)).toBeCloseTo(1222.4, 2);
  });

  it("percentual zero devolve o mesmo valor", () => {
    expect(aplicarBdi(500, 0)).toBe(500);
  });
});
