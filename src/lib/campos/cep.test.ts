import { describe, expect, it } from "vitest";
import { cep } from "./cep";

describe("cep", () => {
  it("mascara, corta em 8 dígitos e aceita colado com ponto", () => {
    expect(cep.mascarar("01310")).toBe("01310");
    expect(cep.mascarar("013101")).toBe("01310-1");
    expect(cep.mascarar("01.310-100")).toBe("01310-100");
    expect(cep.mascarar("013101009")).toBe("01310-100");
  });
  it("valida 8 dígitos; vazio é válido", () => {
    expect(cep.validar("01310-100")).toBe(true);
    expect(cep.validar("0131010")).toBe(false);
    expect(cep.validar("")).toBe(true);
  });
  it("normaliza", () => {
    expect(cep.normalizar("01310100")).toBe("01310-100");
    expect(cep.normalizar("123")).toBe("123");
  });
});
