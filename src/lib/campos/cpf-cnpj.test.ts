import { describe, expect, it } from "vitest";
import { cnpj, cpf, cpfCnpj } from "./cpf-cnpj";

const CPF_OK = "529.982.247-25";
const CNPJ_OK = "11.222.333/0001-81";

describe("cpf", () => {
  it("mascara enquanto digita", () => {
    expect(cpf.mascarar("529")).toBe("529");
    expect(cpf.mascarar("5299")).toBe("529.9");
    expect(cpf.mascarar("5299822")).toBe("529.982.2");
    expect(cpf.mascarar("52998224725")).toBe(CPF_OK);
  });
  it("corta no 11º dígito e ignora letras e pontuação colada", () => {
    expect(cpf.mascarar("529 982 247 25 99")).toBe(CPF_OK);
    expect(cpf.mascarar("a5b2c9")).toBe("529");
  });
  it("valida pelo dígito verificador; vazio é válido", () => {
    expect(cpf.validar(CPF_OK)).toBe(true);
    expect(cpf.validar("52998224725")).toBe(true);
    expect(cpf.validar("529.982.247-24")).toBe(false);
    expect(cpf.validar("111.111.111-11")).toBe(false);
    expect(cpf.validar("")).toBe(true);
    expect(cpf.validar("   ")).toBe(true);
  });
  it("normaliza o válido para o formato padrão e deixa o inválido como veio (aparado)", () => {
    expect(cpf.normalizar(" 52998224725 ")).toBe(CPF_OK);
    expect(cpf.normalizar(" 123 ")).toBe("123");
  });
  it("essência = só dígitos", () => {
    expect(cpf.essencia(CPF_OK)).toBe("52998224725");
  });
});

describe("cnpj", () => {
  it("mascara enquanto digita", () => {
    expect(cnpj.mascarar("11")).toBe("11");
    expect(cnpj.mascarar("112")).toBe("11.2");
    expect(cnpj.mascarar("112223330")).toBe("11.222.333/0");
    expect(cnpj.mascarar("11222333000181")).toBe(CNPJ_OK);
    expect(cnpj.mascarar("11 222 333 0001 81 7")).toBe(CNPJ_OK);
  });
  it("valida e normaliza", () => {
    expect(cnpj.validar("11222333000181")).toBe(true);
    expect(cnpj.validar("11.222.333/0001-80")).toBe(false);
    expect(cnpj.normalizar("11222333000181")).toBe(CNPJ_OK);
  });
});

describe("cpfCnpj", () => {
  it("usa a máscara de CPF até 11 dígitos e a de CNPJ a partir do 12º", () => {
    expect(cpfCnpj.mascarar("52998224725")).toBe(CPF_OK);
    expect(cpfCnpj.mascarar("112223330001")).toBe("11.222.333/0001");
    expect(cpfCnpj.mascarar("11222333000181")).toBe(CNPJ_OK);
  });
  it("valida os dois e normaliza pelo tamanho", () => {
    expect(cpfCnpj.validar(CPF_OK)).toBe(true);
    expect(cpfCnpj.validar(CNPJ_OK)).toBe(true);
    expect(cpfCnpj.validar("123456789")).toBe(false);
    expect(cpfCnpj.normalizar("52998224725")).toBe(CPF_OK);
    expect(cpfCnpj.normalizar("11222333000181")).toBe(CNPJ_OK);
  });
});
