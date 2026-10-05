import { describe, expect, it } from "vitest";
import { campoPix } from "./chave-pix";

describe("campoPix", () => {
  it("CPF: mascara para exibir e grava só dígitos (BACEN)", () => {
    const c = campoPix("cpf");
    expect(c.mascarar("52998224725")).toBe("529.982.247-25");
    expect(c.normalizar("529.982.247-25")).toBe("52998224725");
  });
  it("telefone: exibe com máscara e grava +55", () => {
    const c = campoPix("telefone");
    expect(c.mascarar("+5531999998888")).toBe("(31) 99999-8888");
    expect(c.normalizar("(31) 99999-8888")).toBe("+5531999998888");
  });
  it("aleatória: só hexadecimal e hífen, minúscula, 36", () => {
    const c = campoPix("aleatoria");
    expect(c.mascarar("ABCDEF12-3456-7890-ABCD-EF1234567890xyz")).toBe("abcdef12-3456-7890-abcd-ef1234567890");
  });
  it("motivo vem da regra do PIX; vazio é válido", () => {
    const c = campoPix("cpf");
    expect(c.validar("")).toBe(true);
    expect(c.validar("123")).toBe(false);
    expect(c.motivo?.("123")).toBe("CPF deve ter 11 dígitos.");
  });
});
