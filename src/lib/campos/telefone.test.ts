import { describe, expect, it } from "vitest";
import { telefone } from "./telefone";

describe("telefone", () => {
  it("mascara fixo e celular enquanto digita", () => {
    expect(telefone.mascarar("8")).toBe("(8");
    expect(telefone.mascarar("81")).toBe("(81");
    expect(telefone.mascarar("8133")).toBe("(81) 33");
    expect(telefone.mascarar("8133334444")).toBe("(81) 3333-4444");
    expect(telefone.mascarar("81999998888")).toBe("(81) 99999-8888");
  });
  it("descarta o +55 colado e nunca o confunde com DDD", () => {
    expect(telefone.mascarar("+55 (81) 9 9999-8888")).toBe("(81) 99999-8888");
    expect(telefone.mascarar("5581999998888")).toBe("(81) 99999-8888");
    // DDD 55 (RS) sem código do país continua DDD 55
    expect(telefone.mascarar("55999998888")).toBe("(55) 99999-8888");
  });
  it("valida DDD + fixo (2–5) ou celular (9); vazio é válido", () => {
    expect(telefone.validar("(81) 3333-4444")).toBe(true);
    expect(telefone.validar("(81) 99999-8888")).toBe(true);
    expect(telefone.validar("+55 81 99999-8888")).toBe(true);
    expect(telefone.validar("(81) 89999-8888")).toBe(false);
    expect(telefone.validar("(01) 3333-4444")).toBe(false);
    expect(telefone.validar("3333-4444")).toBe(false);
    expect(telefone.validar("")).toBe(true);
  });
  it("normaliza e compara pelos dígitos nacionais", () => {
    expect(telefone.normalizar("+5581999998888")).toBe("(81) 99999-8888");
    expect(telefone.essencia("+55 (81) 99999-8888")).toBe("81999998888");
  });
});
