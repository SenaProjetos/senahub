import { describe, it, expect } from "vitest";
import { hashSenha, verificarSenha } from "./senha";

describe("hash/verifica senha de exclusão", () => {
  it("verifica a senha correta", () => {
    const h = hashSenha("1234");
    expect(verificarSenha("1234", h)).toBe(true);
  });
  it("rejeita senha errada", () => {
    const h = hashSenha("1234");
    expect(verificarSenha("0000", h)).toBe(false);
  });
  it("rejeita quando não há hash", () => {
    expect(verificarSenha("1234", null)).toBe(false);
    expect(verificarSenha("1234", "")).toBe(false);
    expect(verificarSenha("1234", "lixo")).toBe(false);
  });
  it("gera hashes diferentes para a mesma senha (salt aleatório)", () => {
    expect(hashSenha("abc")).not.toBe(hashSenha("abc"));
  });
});
