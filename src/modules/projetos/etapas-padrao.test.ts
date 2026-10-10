import { describe, expect, it } from "vitest";
import { etapasPadrao, motivoInicioDaEtapa } from "./etapas-padrao";

describe("etapasPadrao — etapas com que a disciplina nasce", () => {
  it("projeto de cliente: Estudo Preliminar, Básico e Executivo", () => {
    expect(etapasPadrao({ tipoProjeto: "particular", semEstudoPreliminar: false })).toEqual(["PL", "BS", "EX"]);
    expect(etapasPadrao({ tipoProjeto: "licitacao", semEstudoPreliminar: false })).toEqual(["PL", "BS", "EX"]);
  });

  it("tipo sem Estudo Preliminar (residencial unifamiliar): só Básico e Executivo", () => {
    expect(etapasPadrao({ tipoProjeto: "particular", semEstudoPreliminar: true })).toEqual(["BS", "EX"]);
  });

  it("aprovação e laudo nascem sem etapa", () => {
    expect(etapasPadrao({ tipoProjeto: "aprovacao", semEstudoPreliminar: false })).toEqual([]);
    expect(etapasPadrao({ tipoProjeto: "laudo", semEstudoPreliminar: true })).toEqual([]);
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
