import { describe, it, expect } from "vitest";
import { parseConfigLicitacoes, CONFIG_LICITACOES_PADRAO } from "./defaults";

describe("parseConfigLicitacoes", () => {
  // Caso 1: undefined → deep-equals CONFIG_LICITACOES_PADRAO
  it("undefined retorna CONFIG_LICITACOES_PADRAO", () => {
    expect(parseConfigLicitacoes(undefined)).toEqual(CONFIG_LICITACOES_PADRAO);
  });

  // Caso 2: null e string → defaults
  it("null retorna CONFIG_LICITACOES_PADRAO", () => {
    expect(parseConfigLicitacoes(null)).toEqual(CONFIG_LICITACOES_PADRAO);
  });

  it("string retorna CONFIG_LICITACOES_PADRAO", () => {
    expect(parseConfigLicitacoes("x")).toEqual(CONFIG_LICITACOES_PADRAO);
  });

  // Caso 3: objeto parcial { pncp: { modo: "api" } }
  it("objeto parcial com pncp.modo api preserva outros defaults", () => {
    const result = parseConfigLicitacoes({ pncp: { modo: "api" } });
    expect(result.pncp.modo).toBe("api");
    expect(result.reajuste.modo).toBe("manual");
    expect(result.datasChave.alertaDiasPadrao).toEqual([15, 7, 1]);
  });

  // Caso 4: pncp.modo inválido → "manual"
  it("pncp.modo inválido cai em 'manual'", () => {
    const result = parseConfigLicitacoes({ pncp: { modo: "lixo" } });
    expect(result.pncp.modo).toBe("manual");
  });

  // Caso 5: aditivo parcial → merge com defaults
  it("aditivo.limiteAcrescimoPctPadrao 50 preserva fatorAviso default", () => {
    const result = parseConfigLicitacoes({ aditivo: { limiteAcrescimoPctPadrao: 50 } });
    expect(result.aditivo.limiteAcrescimoPctPadrao).toBe(50);
    expect(result.aditivo.fatorAviso).toBe(0.8);
  });

  // Caso 6: aditivo.limiteAcrescimoPctPadrao inválido → default 25
  it("aditivo.limiteAcrescimoPctPadrao string cai no default 25", () => {
    const result = parseConfigLicitacoes({ aditivo: { limiteAcrescimoPctPadrao: "x" } });
    expect(result.aditivo.limiteAcrescimoPctPadrao).toBe(25);
  });

  // Caso 7: recurso.alertaDiasPadrao arrays válido e inválido
  it("recurso.alertaDiasPadrao array válido é usado", () => {
    const result = parseConfigLicitacoes({ recurso: { alertaDiasPadrao: [5] } });
    expect(result.recurso.alertaDiasPadrao).toEqual([5]);
  });

  it("recurso.alertaDiasPadrao string cai no default [3,1]", () => {
    const result = parseConfigLicitacoes({ recurso: { alertaDiasPadrao: "x" } });
    expect(result.recurso.alertaDiasPadrao).toEqual([3, 1]);
  });

  // Caso 8: reajuste.indices filtra não-strings
  it("reajuste.indices filtra elementos não-string", () => {
    const result = parseConfigLicitacoes({ reajuste: { indices: ["IPCA", 2, null] } });
    expect(result.reajuste.indices).toEqual(["IPCA"]);
  });

  // Caso 9 (4.2): undefined → percentualPadrao === 0
  it("undefined → reajuste.percentualPadrao === 0", () => {
    expect(parseConfigLicitacoes(undefined).reajuste.percentualPadrao).toBe(0);
  });

  // Caso 10 (4.2): percentualPadrao 8.5 é preservado; outros campos ficam no default
  it("reajuste.percentualPadrao 8.5 aceito; modo e indices ficam no default", () => {
    const result = parseConfigLicitacoes({ reajuste: { percentualPadrao: 8.5 } });
    expect(result.reajuste.percentualPadrao).toBe(8.5);
    expect(result.reajuste.modo).toBe("manual");
    expect(result.reajuste.indices).toEqual(["IPCA", "INCC", "IGP-M"]);
  });

  // Caso 11 (4.2): percentualPadrao inválido (string) → 0
  it("reajuste.percentualPadrao string cai no default 0", () => {
    const result = parseConfigLicitacoes({ reajuste: { percentualPadrao: "x" } });
    expect(result.reajuste.percentualPadrao).toBe(0);
  });
});
