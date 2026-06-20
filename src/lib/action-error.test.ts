import { describe, it, expect } from "vitest";
import { ActionError, resultadoDoErro } from "@/lib/action-error";

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
