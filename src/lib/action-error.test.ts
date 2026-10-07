import { describe, it, expect } from "vitest";
import { ActionError, fieldErrorsDoErro, resultadoDoErro } from "@/lib/action-error";

describe("resultadoDoErro", () => {
  it("classifica ActionError como 'rejeitado'", () => {
    expect(resultadoDoErro(new ActionError("lote vazio"))).toBe("rejeitado");
  });

  it("classifica Error genérico como 'falha'", () => {
    expect(resultadoDoErro(new Error("boom"))).toBe("falha");
  });

  it("classifica valor não-Error como 'falha'", () => {
    expect(resultadoDoErro("oops")).toBe("falha");
    expect(resultadoDoErro(undefined)).toBe("falha");
  });
});

describe("fieldErrorsDoErro", () => {
  it("devolve o mapa por campo no formato do Zod", () => {
    const err = new ActionError("CPF inválido.", { cpf: "CPF inválido.", telefone: "Telefone inválido." });
    expect(fieldErrorsDoErro(err)).toEqual({ cpf: ["CPF inválido."], telefone: ["Telefone inválido."] });
  });
  it("sem campos, ou erro que não é ActionError, não devolve nada", () => {
    expect(fieldErrorsDoErro(new ActionError("x"))).toBeUndefined();
    expect(fieldErrorsDoErro(new ActionError("x", {}))).toBeUndefined();
    expect(fieldErrorsDoErro(new Error("x"))).toBeUndefined();
  });
  it("continua sendo rejeição de regra para a auditoria", () => {
    expect(resultadoDoErro(new ActionError("x", { a: "b" }))).toBe("rejeitado");
  });
});
