import { describe, expect, it } from "vitest";
import { email } from "./email";

describe("email", () => {
  it("tira espaço e passa para minúscula enquanto digita", () => {
    expect(email.mascarar(" Ana @Empresa.com ")).toBe("ana@empresa.com");
  });
  it("valida o formato; vazio é válido", () => {
    expect(email.validar("ana@empresa.com.br")).toBe(true);
    expect(email.validar("ana@empresa")).toBe(false);
    expect(email.validar("ana empresa.com")).toBe(false);
    expect(email.validar("")).toBe(true);
  });
  it("normaliza para minúscula aparada", () => {
    expect(email.normalizar("  Ana@Empresa.COM ")).toBe("ana@empresa.com");
  });
});
