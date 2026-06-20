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

  // --- PNCP: import automático (novos campos) -------------------------------

  // Defaults dos novos campos pncp
  it("undefined → pncp tem defaults de import (palavrasChave [], modalidades [6,4], ufs [], janelaDias 2)", () => {
    const p = parseConfigLicitacoes(undefined).pncp;
    expect(p.palavrasChave).toEqual([]);
    expect(p.modalidades).toEqual([6, 4]);
    expect(p.ufs).toEqual([]);
    expect(p.janelaDias).toBe(2);
  });

  // palavrasChave: aceita strings válidas, descarta vazias e não-strings
  it("pncp.palavrasChave filtra vazios e não-strings", () => {
    const result = parseConfigLicitacoes({
      pncp: { palavrasChave: ["projeto", "  ", 5, null, "engenharia"] },
    });
    expect(result.pncp.palavrasChave).toEqual(["projeto", "engenharia"]);
  });

  // palavrasChave inválido (não-array) → mantém default []
  it("pncp.palavrasChave string cai no default []", () => {
    const result = parseConfigLicitacoes({ pncp: { palavrasChave: "projeto" } });
    expect(result.pncp.palavrasChave).toEqual([]);
  });

  // modalidades: aceita números válidos, descarta não-números
  it("pncp.modalidades filtra não-números", () => {
    const result = parseConfigLicitacoes({ pncp: { modalidades: [6, "4", null, 8] } });
    expect(result.pncp.modalidades).toEqual([6, 8]);
  });

  // modalidades inválido (não-array) → mantém default [6,4]
  it("pncp.modalidades objeto cai no default [6,4]", () => {
    const result = parseConfigLicitacoes({ pncp: { modalidades: { a: 1 } } });
    expect(result.pncp.modalidades).toEqual([6, 4]);
  });

  // modalidades vazio explícito é respeitado
  it("pncp.modalidades [] explícito é preservado", () => {
    const result = parseConfigLicitacoes({ pncp: { modalidades: [] } });
    expect(result.pncp.modalidades).toEqual([]);
  });

  // ufs: aceita strings, descarta vazios/não-strings
  it("pncp.ufs filtra vazios e não-strings", () => {
    const result = parseConfigLicitacoes({ pncp: { ufs: ["SP", " ", 1, "RJ"] } });
    expect(result.pncp.ufs).toEqual(["SP", "RJ"]);
  });

  // janelaDias: número válido é aceito
  it("pncp.janelaDias 5 é aceito", () => {
    const result = parseConfigLicitacoes({ pncp: { janelaDias: 5 } });
    expect(result.pncp.janelaDias).toBe(5);
  });

  // janelaDias inválido (string / negativo) → default 2
  it("pncp.janelaDias string cai no default 2", () => {
    const result = parseConfigLicitacoes({ pncp: { janelaDias: "x" } });
    expect(result.pncp.janelaDias).toBe(2);
  });

  it("pncp.janelaDias negativo cai no default 2", () => {
    const result = parseConfigLicitacoes({ pncp: { janelaDias: -3 } });
    expect(result.pncp.janelaDias).toBe(2);
  });

  // modo + novos campos coexistem; demais seções intactas
  it("pncp modo api + palavrasChave preserva outros defaults pncp e demais seções", () => {
    const result = parseConfigLicitacoes({
      pncp: { modo: "api", palavrasChave: ["obra"], janelaDias: 7 },
    });
    expect(result.pncp.modo).toBe("api");
    expect(result.pncp.palavrasChave).toEqual(["obra"]);
    expect(result.pncp.janelaDias).toBe(7);
    expect(result.pncp.modalidades).toEqual([6, 4]);
    expect(result.reajuste.modo).toBe("manual");
  });
});
