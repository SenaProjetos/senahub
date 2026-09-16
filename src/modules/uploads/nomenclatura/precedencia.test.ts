import { describe, expect, it } from "vitest";
import { resolverMetadado } from "./precedencia";

describe("resolverMetadado (ADR-0003, regra 2)", () => {
  it("escolha manual vence tudo — inclusive valor que o documento já tinha", () => {
    expect(resolverMetadado("f-ex", "f-bs", "f-ap")).toEqual({ valor: "f-ex", origem: "manual" });
    expect(resolverMetadado("f-ex", null, null)).toEqual({ valor: "f-ex", origem: "manual" });
  });

  it("leitura do nome preenche só o que está vazio", () => {
    expect(resolverMetadado(null, "f-ex", null)).toEqual({ valor: "f-ex", origem: "nome" });
    expect(resolverMetadado(null, "f-ex", "f-ap")).toBeUndefined();
  });

  it("sem manual e sem leitura confiável, não mexe no campo", () => {
    expect(resolverMetadado(null, null, null)).toBeUndefined();
    expect(resolverMetadado(undefined, undefined, "f-ap")).toBeUndefined();
  });

  it("vale para número, não só para id", () => {
    expect(resolverMetadado<number>(null, 4001, null)).toEqual({ valor: 4001, origem: "nome" });
    // `0` é valor legítimo (revisão zero, prancha 0) e não pode ser confundido com vazio.
    expect(resolverMetadado<number>(null, 0, null)).toEqual({ valor: 0, origem: "nome" });
    expect(resolverMetadado<number>(null, 4001, 0)).toBeUndefined();
  });
});
