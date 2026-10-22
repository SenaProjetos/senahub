import { describe, expect, it } from "vitest";
import { metadadoAoRenomear, resolverMetadado } from "./precedencia";

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

describe("metadadoAoRenomear", () => {
  it("o que o nome antigo dizia segue o nome novo", () => {
    expect(metadadoAoRenomear("t-m3d", "t-m3d", "t-det")).toBe("t-det");
    expect(metadadoAoRenomear<number>(4001, 4001, 4005)).toBe(4005);
  });

  it("campo vazio recebe a leitura do nome novo", () => {
    expect(metadadoAoRenomear<number>(null, undefined, 405)).toBe(405);
  });

  it("valor que o nome antigo não explicava é escolha de alguém e fica", () => {
    expect(metadadoAoRenomear("f-bs", "f-ex", "f-ex")).toBeUndefined();
    expect(metadadoAoRenomear("t-det", undefined, "t-m3d")).toBeUndefined();
  });

  it("sem leitura do nome novo, ou já igual, não mexe", () => {
    expect(metadadoAoRenomear("f-ex", "f-ex", undefined)).toBeUndefined();
    expect(metadadoAoRenomear("f-ex", "f-bs", "f-ex")).toBeUndefined();
  });
});
