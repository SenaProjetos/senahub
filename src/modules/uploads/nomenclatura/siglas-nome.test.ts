import { describe, expect, it } from "vitest";
import { catalogoDaVersao, vocabularioDaVersao } from "@/test/catalogo-nomenclatura-versoes";
import { opcoesNaVersao, siglaDoCardNaVersao, siglaNoLugarDaDisciplina, subsDoCard } from "./siglas-nome";

const fases = [
  { id: "f-bs", sigla: "BS", nome: "Básico" },
  { id: "f-ap", sigla: "AP", nome: "Anteprojeto" },
];

describe("opcoesNaVersao", () => {
  it("troca a sigla da coluna pela da versão", () => {
    expect(opcoesNaVersao(fases, vocabularioDaVersao(1), "fase").map((f) => f.sigla)).toEqual(["BS", "AP"]);
    expect(opcoesNaVersao(fases, vocabularioDaVersao(2), "fase").map((f) => f.sigla)).toEqual(["BAS", "AP"]);
  });

  it("item sem sigla na versão sai da lista", () => {
    const tipos = [{ id: "t-plb", sigla: "PLB", nome: "Planta baixa" }];
    expect(opcoesNaVersao(tipos, vocabularioDaVersao(1), "tipo")).toEqual([]);
    expect(opcoesNaVersao(tipos, vocabularioDaVersao(2), "tipo")).toEqual(tipos);
  });
});

describe("siglaDoCardNaVersao", () => {
  it("sigla da versão para card do catálogo", () => {
    const spda = { catalogoId: "d-spd", sigla: "SPD" };
    expect(siglaDoCardNaVersao(spda, catalogoDaVersao(1), vocabularioDaVersao(1))).toBe("SPD");
    expect(siglaDoCardNaVersao(spda, catalogoDaVersao(2), vocabularioDaVersao(2))).toBe("PDA");
  });

  it("card da versão sem sigla geral: null (o nome precisa de sub)", () => {
    expect(siglaDoCardNaVersao({ catalogoId: "d-tel", sigla: null }, catalogoDaVersao(2), vocabularioDaVersao(2))).toBeNull();
  });

  it("disciplina fora do catálogo mantém a sigla que já tinha", () => {
    expect(siglaDoCardNaVersao({ catalogoId: null, sigla: "XYZ" }, catalogoDaVersao(2), vocabularioDaVersao(2))).toBe("XYZ");
  });
});

describe("subsDoCard e siglaNoLugarDaDisciplina", () => {
  it("lista as subs do card só na versão em que existem", () => {
    expect(subsDoCard("d-hid", catalogoDaVersao(1))).toEqual([]);
    expect(subsDoCard("d-hid", catalogoDaVersao(2)).map((s) => s.sigla)).toEqual(["AGF", "AGQ", "ESG"]);
  });

  it("sub escolhida vence a sigla geral do card", () => {
    const card = { sigla: "HID", subdisciplinas: subsDoCard("d-hid", catalogoDaVersao(2)) };
    expect(siglaNoLugarDaDisciplina(card, "s-agq")).toBe("AGQ");
    expect(siglaNoLugarDaDisciplina(card, null)).toBe("HID");
    expect(siglaNoLugarDaDisciplina({ sigla: null }, null)).toBeNull();
  });
});
