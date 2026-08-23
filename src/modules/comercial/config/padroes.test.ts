import { describe, it, expect } from "vitest";
import {
  CONFIG_COMERCIAL_PADRAO,
  parseConfigComercial,
  exigeJustificativaDesconto,
  paraParametrosRegras,
} from "./padroes";

describe("parseConfigComercial", () => {
  it("cai nos defaults quando não há nada gravado", () => {
    expect(parseConfigComercial(null)).toEqual(CONFIG_COMERCIAL_PADRAO);
    expect(parseConfigComercial(undefined)).toEqual(CONFIG_COMERCIAL_PADRAO);
    expect(parseConfigComercial({})).toEqual(CONFIG_COMERCIAL_PADRAO);
  });

  it("cai nos defaults quando o valor gravado não é objeto", () => {
    expect(parseConfigComercial("15")).toEqual(CONFIG_COMERCIAL_PADRAO);
    expect(parseConfigComercial(42)).toEqual(CONFIG_COMERCIAL_PADRAO);
    expect(parseConfigComercial([])).toEqual({ ...CONFIG_COMERCIAL_PADRAO });
  });

  it("usa os valores gravados quando são válidos", () => {
    const r = parseConfigComercial({
      descontoMaxSemJustificativa: 5,
      diasSemContato: 30,
      diasAvisoValidadeProposta: 3,
      diasClienteInativo: 365,
      diasParadoNoEstagio: 45,
      diasParaReativar: 400,
      diasHorizonteProximasAcoes: 14,
    });
    expect(r).toEqual({
      descontoMaxSemJustificativa: 5,
      diasSemContato: 30,
      diasAvisoValidadeProposta: 3,
      diasClienteInativo: 365,
      diasParadoNoEstagio: 45,
      diasParaReativar: 400,
      diasHorizonteProximasAcoes: 14,
    });
  });

  it("os dois campos novos da F7.2 caem no default quando ausentes", () => {
    const r = parseConfigComercial({ diasSemContato: 20 });
    expect(r.diasParadoNoEstagio).toBe(CONFIG_COMERCIAL_PADRAO.diasParadoNoEstagio);
    expect(r.diasParaReativar).toBe(CONFIG_COMERCIAL_PADRAO.diasParaReativar);
  });

  it("o campo novo da F6.5 cai no default quando ausente", () => {
    const r = parseConfigComercial({ diasSemContato: 20 });
    expect(r.diasHorizonteProximasAcoes).toBe(CONFIG_COMERCIAL_PADRAO.diasHorizonteProximasAcoes);
  });

  it("um campo inválido não derruba os outros", () => {
    const r = parseConfigComercial({ diasSemContato: "trinta", diasClienteInativo: 90 });
    expect(r.diasSemContato).toBe(CONFIG_COMERCIAL_PADRAO.diasSemContato);
    expect(r.diasClienteInativo).toBe(90);
  });

  it("rejeita negativo — regra que nunca dispararia, falhando em silêncio", () => {
    const r = parseConfigComercial({ diasSemContato: -5, descontoMaxSemJustificativa: -1 });
    expect(r.diasSemContato).toBe(CONFIG_COMERCIAL_PADRAO.diasSemContato);
    expect(r.descontoMaxSemJustificativa).toBe(
      CONFIG_COMERCIAL_PADRAO.descontoMaxSemJustificativa,
    );
  });

  it("rejeita NaN e Infinity", () => {
    const r = parseConfigComercial({ diasSemContato: NaN, diasClienteInativo: Infinity });
    expect(r.diasSemContato).toBe(CONFIG_COMERCIAL_PADRAO.diasSemContato);
    expect(r.diasClienteInativo).toBe(CONFIG_COMERCIAL_PADRAO.diasClienteInativo);
  });

  it("aceita zero — desligar o limiar é configuração legítima", () => {
    expect(parseConfigComercial({ descontoMaxSemJustificativa: 0 }).descontoMaxSemJustificativa)
      .toBe(0);
  });
});

describe("exigeJustificativaDesconto", () => {
  const cfg = CONFIG_COMERCIAL_PADRAO; // descontoMaxSemJustificativa = 10

  it("não exige abaixo do limite", () => {
    expect(exigeJustificativaDesconto(5, cfg)).toBe(false);
  });

  it("NÃO exige exatamente no limite — o limite é o teto do que passa livre", () => {
    expect(exigeJustificativaDesconto(10, cfg)).toBe(false);
  });

  it("exige acima do limite, inclusive por fração", () => {
    expect(exigeJustificativaDesconto(10.01, cfg)).toBe(true);
    expect(exigeJustificativaDesconto(25, cfg)).toBe(true);
  });

  it("com limite 0, qualquer desconto exige justificativa", () => {
    const zero = { ...cfg, descontoMaxSemJustificativa: 0 };
    expect(exigeJustificativaDesconto(0, zero)).toBe(false);
    expect(exigeJustificativaDesconto(0.5, zero)).toBe(true);
  });
});

describe("paraParametrosRegras (F7.2 — a ponte com regras.ts)", () => {
  it("repassa os 5 números que as regras de automação consultam, sem inventar nenhum", () => {
    const config = {
      ...CONFIG_COMERCIAL_PADRAO,
      diasSemContato: 20,
      diasAvisoValidadeProposta: 5,
      diasClienteInativo: 200,
      diasParadoNoEstagio: 40,
      diasParaReativar: 500,
    };
    expect(paraParametrosRegras(config)).toEqual({
      diasSemContato: 20,
      diasAvisoValidadeProposta: 5,
      diasClienteInativo: 200,
      diasParadoNoEstagio: 40,
      diasParaReativar: 500,
    });
  });

  it("NÃO repassa descontoMaxSemJustificativa — regras.ts não tem regra de desconto", () => {
    const r = paraParametrosRegras(CONFIG_COMERCIAL_PADRAO);
    expect(r).not.toHaveProperty("descontoMaxSemJustificativa");
  });
});
