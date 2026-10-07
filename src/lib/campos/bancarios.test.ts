import { describe, expect, it } from "vitest";
import { agencia, conta, rg } from "./bancarios";

describe("rg", () => {
  it("maiúsculo, sem pontuação, até 14", () => {
    expect(rg.mascarar("12.345.678-x")).toBe("12345678X");
    expect(rg.mascarar("123456789012345678")).toBe("12345678901234");
  });
  it("5 a 14 caracteres com ao menos um dígito; vazio é válido", () => {
    expect(rg.validar("1234567")).toBe(true);
    expect(rg.validar("MG1234567")).toBe(true);
    expect(rg.validar("1234")).toBe(false);
    expect(rg.validar("ABCDEF")).toBe(false);
    expect(rg.validar("")).toBe(true);
  });
  it("normaliza", () => {
    expect(rg.normalizar("12.345.678-9")).toBe("123456789");
  });
});

describe("agencia", () => {
  it("4 dígitos e DV opcional depois do hífen", () => {
    expect(agencia.mascarar("123")).toBe("123");
    expect(agencia.mascarar("1234")).toBe("1234");
    expect(agencia.mascarar("12345")).toBe("1234-5");
    expect(agencia.mascarar("1234x")).toBe("1234-X");
  });
  it("valida", () => {
    expect(agencia.validar("1234")).toBe(true);
    expect(agencia.validar("1234-X")).toBe(true);
    expect(agencia.validar("123")).toBe(false);
    expect(agencia.validar("")).toBe(true);
  });
});

describe("conta", () => {
  it("o último caractere é o dígito", () => {
    expect(conta.mascarar("1")).toBe("1");
    expect(conta.mascarar("12")).toBe("1-2");
    expect(conta.mascarar("123456")).toBe("12345-6");
    expect(conta.mascarar("12345x")).toBe("12345-X");
  });
  it("valida número (1–12 dígitos) + DV", () => {
    expect(conta.validar("12345-6")).toBe(true);
    expect(conta.validar("12345-X")).toBe(true);
    expect(conta.validar("1")).toBe(false);
    expect(conta.validar("1X345-6")).toBe(false);
    expect(conta.validar("")).toBe(true);
  });
  it("normaliza e compara sem hífen", () => {
    expect(conta.normalizar("123456")).toBe("12345-6");
    expect(conta.essencia("12345-6")).toBe("123456");
  });
});
