import { describe, expect, it } from "vitest";
import { cnh, ctpsNumero, ctpsSerie, pis, tituloEleitor, validarCnh, validarPis } from "./documentos-trabalhistas";

describe("pis", () => {
  it("máscara progressiva 000.00000.00-0", () => {
    expect(pis.mascarar("12345678919")).toBe("123.45678.91-9");
    expect(pis.mascarar("1234")).toBe("123.4");
    expect(pis.mascarar("123456789")).toBe("123.45678.9");
  });
  it("valida pelo DV (módulo 11)", () => {
    expect(validarPis("123.45678.91-9")).toBe(true);
    expect(validarPis("12345678918")).toBe(false);
    expect(validarPis("11111111111")).toBe(false);
    expect(validarPis("1234567891")).toBe(false);
  });
  it("vazio é válido; normaliza para o formato padrão", () => {
    expect(pis.validar("")).toBe(true);
    expect(pis.normalizar("12345678919")).toBe("123.45678.91-9");
  });
  it("valor com algo além do número não é limpo (legado intocado)", () => {
    expect(pis.limpo("123.45678.91-9 NIS")).toBe(false);
    expect(pis.validar("123.45678.91-9 NIS")).toBe(false);
  });
});

describe("ctps", () => {
  it("número até 7 dígitos, série até 5; só números", () => {
    expect(ctpsNumero.mascarar("12345678")).toBe("1234567");
    expect(ctpsSerie.mascarar("123456")).toBe("12345");
    expect(ctpsNumero.mascarar("12a3")).toBe("123");
  });
  it("valida", () => {
    expect(ctpsNumero.validar("1234567")).toBe(true);
    expect(ctpsNumero.validar("")).toBe(true);
    expect(ctpsNumero.validar("12345678")).toBe(false);
    expect(ctpsSerie.validar("0123")).toBe(true);
    expect(ctpsSerie.validar("12A")).toBe(false);
  });
  it("zeros à esquerda são preservados", () => {
    expect(ctpsSerie.normalizar("0123")).toBe("0123");
  });
});

describe("tituloEleitor", () => {
  it("máscara 0000 0000 0000", () => {
    expect(tituloEleitor.mascarar("123456780116")).toBe("1234 5678 0116");
  });
  it("12 dígitos com UF 01–28 nas posições 9-10", () => {
    expect(tituloEleitor.validar("1234 5678 0116")).toBe(true);
    expect(tituloEleitor.validar("123456782916")).toBe(false); // UF 29
    expect(tituloEleitor.validar("123456780016")).toBe(false); // UF 00
    expect(tituloEleitor.validar("12345678011")).toBe(false);
    expect(tituloEleitor.validar("")).toBe(true);
  });
});

describe("cnh", () => {
  it("valida pelos dois DVs", () => {
    expect(validarCnh("02650306461")).toBe(true);
    expect(validarCnh("02650306462")).toBe(false);
    expect(validarCnh("00000000000")).toBe(false);
  });
  it("máscara só dígitos, até 11; normaliza", () => {
    expect(cnh.mascarar("026 503 064 61 99")).toBe("02650306461");
    expect(cnh.normalizar(" 02650306461 ")).toBe("02650306461");
  });
});
