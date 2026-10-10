import { describe, expect, it } from "vitest";
import { fasesParaNascer, motivoInicioDaEtapa, type FaseDoCatalogo } from "./etapas-padrao";

const catalogo: FaseDoCatalogo[] = [
  { id: "ab", sigla: "AB", ordem: 5 },
  { id: "ex", sigla: "EX", ordem: 3 },
  { id: "pl", sigla: "PL", ordem: 0 },
  { id: "bs", sigla: "BS", ordem: 2 },
  { id: "ap", sigla: "AP", ordem: 1 },
];

describe("fasesParaNascer — fases com que a disciplina nasce", () => {
  it("sem lista no tipo (ou sem tipo): o padrão do sistema, na ordem do catálogo", () => {
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: [], catalogo })).toEqual(["pl", "bs", "ex"]);
    expect(fasesParaNascer({ tipoProjeto: "licitacao", idsDoTipo: null, catalogo })).toEqual(["pl", "bs", "ex"]);
  });

  it("com lista no tipo: só as escolhidas, na ordem do catálogo (não na ordem em que foram marcadas)", () => {
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: ["ex", "bs"], catalogo })).toEqual(["bs", "ex"]);
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: ["ab", "ap", "ex"], catalogo })).toEqual(["ap", "ex", "ab"]);
  });

  it("fase do tipo que saiu do catálogo é pulada; se nenhuma sobra, a disciplina nasce sem etapa", () => {
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: ["bs", "apagada"], catalogo })).toEqual(["bs"]);
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: ["apagada"], catalogo })).toEqual([]);
  });

  it("padrão do sistema com fase inativa no catálogo (fora da lista recebida): nasce com as que existem", () => {
    expect(fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: [], catalogo: catalogo.filter((f) => f.id !== "bs") })).toEqual(["pl", "ex"]);
  });

  it("aprovação e laudo nascem sem etapa, mesmo com lista no tipo", () => {
    expect(fasesParaNascer({ tipoProjeto: "aprovacao", idsDoTipo: [], catalogo })).toEqual([]);
    expect(fasesParaNascer({ tipoProjeto: "laudo", idsDoTipo: ["bs"], catalogo })).toEqual([]);
  });
});

describe("motivoInicioDaEtapa", () => {
  it("recusa início depois do fim; aceita vazio e igual", () => {
    expect(motivoInicioDaEtapa("2026-11-10", "2026-11-05")).toMatch(/não pode ser depois/);
    expect(motivoInicioDaEtapa("2026-11-05", "2026-11-05")).toBeNull();
    expect(motivoInicioDaEtapa(null, "2026-11-05")).toBeNull();
    expect(motivoInicioDaEtapa("2026-11-05", null)).toBeNull();
  });
});
