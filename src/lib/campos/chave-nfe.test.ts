import { describe, expect, it } from "vitest";
import { chaveNfe, chaveNfeValida, modeloDaChave } from "./chave-nfe";

// NF-e com DV correto, a mesma usada em financeiro/lancamentos/baixa.test.ts.
const CHAVE = "35200714200166000187550010000000046550010007";
// NF-e de emitente com CNPJ alfanumérico (12ABC34501DE35): DV calculado à parte com ASCII − 48.
const CHAVE_ALFA = "35200712ABC34501DE35550010000000046550010006";
// NFS-e nacional: Recife (2611606), produção (1), CNPJ (2) 11.444.777/0001-61, nota 123, out/2026, código e DV.
const NFSE = "2611606" + "1" + "2" + "11444777000161" + "0000000000123" + "2610" + "123456789" + "7";

describe("chaveNfe", () => {
  it("mascara em grupos de 4 só para exibir", () => {
    expect(chaveNfe.mascarar("35240312")).toBe("3524 0312");
    expect(chaveNfe.mascarar(CHAVE).replace(/\s/g, "")).toBe(CHAVE);
    expect(chaveNfe.mascarar(NFSE).replace(/\s/g, "")).toBe(NFSE);
  });
  it("grava os caracteres corridos, em maiúsculas", () => {
    expect(chaveNfe.normalizar(chaveNfe.mascarar(CHAVE))).toBe(CHAVE);
    expect(chaveNfe.normalizar(CHAVE_ALFA.toLowerCase())).toBe(CHAVE_ALFA);
  });
  it("valida pelo módulo 11; vazio é válido", () => {
    expect(chaveNfe.validar("")).toBe(true);
    expect(chaveNfe.validar("123")).toBe(false);
    expect(chaveNfeValida(CHAVE)).toBe(chaveNfe.validar(CHAVE));
    expect(chaveNfe.validar(CHAVE)).toBe(true);
    expect(chaveNfe.validar(CHAVE.slice(0, 43) + "8")).toBe(false);
  });
});

describe("modeloDaChave", () => {
  it("44 caracteres com DV certo é NF-e, também com CNPJ alfanumérico", () => {
    expect(modeloDaChave(CHAVE)).toBe("nfe");
    expect(modeloDaChave(CHAVE_ALFA)).toBe("nfe");
    expect(modeloDaChave(CHAVE_ALFA.slice(0, 43) + "5")).toBeNull();
  });
  it("letra fora do CNPJ não é chave", () => {
    expect(modeloDaChave("A" + CHAVE.slice(1))).toBeNull();
  });
  it("50 caracteres no formato do padrão nacional é NFS-e", () => {
    expect(modeloDaChave(NFSE)).toBe("nfse");
    expect(modeloDaChave(chaveNfe.mascarar(NFSE))).toBe("nfse");
    expect(chaveNfe.validar(NFSE)).toBe(true);
  });
  it("NFS-e com mês impossível, tamanho errado ou letra no número não passa", () => {
    expect(modeloDaChave(NFSE.slice(0, 38) + "13" + NFSE.slice(40))).toBeNull();
    expect(modeloDaChave(NFSE.slice(0, 49))).toBeNull();
    expect(modeloDaChave(NFSE.slice(0, 30) + "X" + NFSE.slice(31))).toBeNull();
  });
});
