import { describe, it, expect } from "vitest";
import { validarCPF, validarCNPJ, validarCpfCnpj, formatarCpfCnpj } from "./documento";

describe("validarCPF", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(validarCPF("529.982.247-25")).toBe(true);
    expect(validarCPF("52998224725")).toBe(true);
  });
  it("rejeita dígitos inválidos, repetidos e tamanho errado", () => {
    expect(validarCPF("529.982.247-24")).toBe(false);
    expect(validarCPF("111.111.111-11")).toBe(false);
    expect(validarCPF("123")).toBe(false);
  });
});

describe("validarCNPJ", () => {
  it("aceita CNPJ válido (com e sem máscara)", () => {
    expect(validarCNPJ("11.222.333/0001-81")).toBe(true);
    expect(validarCNPJ("11222333000181")).toBe(true);
  });
  it("rejeita inválido e repetido", () => {
    expect(validarCNPJ("11.222.333/0001-80")).toBe(false);
    expect(validarCNPJ("00000000000000")).toBe(false);
  });
});

describe("validarCpfCnpj / formatar", () => {
  it("roteia por tamanho", () => {
    expect(validarCpfCnpj("52998224725")).toBe(true);
    expect(validarCpfCnpj("11222333000181")).toBe(true);
    expect(validarCpfCnpj("123")).toBe(false);
  });
  it("formata com máscara", () => {
    expect(formatarCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
