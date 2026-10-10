import { describe, it, expect } from "vitest";
import { ehJornada, ehPrestador, usaApontamento } from "@/lib/contratacao";

describe("grupos de contratação", () => {
  it("jornada: só CLT e estágio", () => {
    expect(["clt", "estagio"].map((c) => ehJornada(c as never))).toEqual([true, true]);
    expect(["pj", "autonomo_rpa", "pro_labore"].map((c) => ehJornada(c as never))).toEqual([false, false, false]);
  });

  it("prestador: PJ e RPA (o freelancer migrado continua dentro)", () => {
    expect(ehPrestador("pj")).toBe(true);
    expect(ehPrestador("autonomo_rpa")).toBe(true);
    expect(ehPrestador("pro_labore")).toBe(false);
    expect(ehPrestador("clt")).toBe(false);
  });

  it("apontamento: prestador e sócio de pró-labore", () => {
    expect(usaApontamento("pro_labore")).toBe(true);
    expect(usaApontamento("pj")).toBe(true);
    expect(usaApontamento("clt")).toBe(false);
  });

  it("sem vínculo (nulo) não está em grupo nenhum — decisão 1 do dono", () => {
    for (const f of [ehJornada, ehPrestador, usaApontamento]) {
      expect(f(null)).toBe(false);
      expect(f(undefined)).toBe(false);
    }
  });
});
