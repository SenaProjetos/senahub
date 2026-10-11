import { describe, expect, it } from "vitest";
import { diffResponsaveis, disciplinasNaData } from "./responsaveis";

describe("diffResponsaveis", () => {
  it("separa quem entra e quem sai", () => {
    expect(diffResponsaveis(["a", "b"], ["b", "c"])).toEqual({ entram: ["c"], saem: ["a"] });
  });
  it("listas iguais não mudam nada, mesmo em outra ordem ou com repetição", () => {
    expect(diffResponsaveis(["a", "b"], ["b", "a", "a"])).toEqual({ entram: [], saem: [] });
  });
  it("de ninguém para alguém e de alguém para ninguém", () => {
    expect(diffResponsaveis([], ["a"])).toEqual({ entram: ["a"], saem: [] });
    expect(diffResponsaveis(["a"], [])).toEqual({ entram: [], saem: ["a"] });
  });
});

describe("disciplinasNaData (decisão 13)", () => {
  const h = [
    { disciplinaId: "d1", inicio: new Date("2026-03-01T00:00:00Z"), fim: new Date("2026-04-01T00:00:00Z") },
    { disciplinaId: "d2", inicio: new Date("2026-04-01T00:00:00Z"), fim: null },
  ];
  it("conta de início (inclusive) até fim (exclusivo)", () => {
    expect(disciplinasNaData(h, new Date("2026-03-15T12:00:00Z"))).toEqual(["d1"]);
    expect(disciplinasNaData(h, new Date("2026-04-01T00:00:00Z"))).toEqual(["d2"]);
    expect(disciplinasNaData(h, new Date("2026-03-01T00:00:00Z"))).toEqual(["d1"]);
  });
  it("aberta (fim nulo) vale para sempre depois do início; antes do início, nada", () => {
    expect(disciplinasNaData(h, new Date("2027-01-01T00:00:00Z"))).toEqual(["d2"]);
    expect(disciplinasNaData(h, new Date("2026-02-01T00:00:00Z"))).toEqual([]);
  });
  it("sem repetir a disciplina", () => {
    const dupla = [...h, { disciplinaId: "d2", inicio: new Date("2026-05-01T00:00:00Z"), fim: null }];
    expect(disciplinasNaData(dupla, new Date("2026-06-01T00:00:00Z"))).toEqual(["d2"]);
  });
});
