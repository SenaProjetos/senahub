import { describe, expect, it } from "vitest";
import { buscarNormas, montarPastas, normasDaPasta, PASTA_GERAL, type NormaParaPasta } from "./pastas-normas";

const ARQ = { id: "d-arq", nome: "Arquitetura", ordem: 1 };
const EST = { id: "d-est", nome: "Estrutural", ordem: 3 };
const HID = { id: "d-hid", nome: "Hidrossanitário", ordem: 4 };

const norma = (numero: string, titulo: string, disciplinas: NormaParaPasta["disciplinas"], ano = 2020) => ({
  numero,
  titulo,
  ano,
  disciplinas,
});

const NBR6118 = norma("NBR 6118", "Projeto de estruturas de concreto", [EST], 2023);
const NBR5626 = norma("NBR 5626", "Sistemas prediais de água fria e água quente", [HID]);
const NBR15575 = norma("NBR 15575", "Edificações habitacionais — Desempenho", [HID, ARQ, EST], 2021);
const NR18 = norma("NR 18", "Segurança e saúde no trabalho na construção", []);
const TODAS = [NBR6118, NBR5626, NBR15575, NR18];

describe("montarPastas", () => {
  it("uma pasta por disciplina com norma, na ordem do catálogo, e Geral no fim", () => {
    expect(montarPastas(TODAS)).toEqual([
      { tipo: "disciplina", id: "d-arq", nome: "Arquitetura", total: 1 },
      { tipo: "disciplina", id: "d-est", nome: "Estrutural", total: 2 },
      { tipo: "disciplina", id: "d-hid", nome: "Hidrossanitário", total: 2 },
      { tipo: "geral", id: PASTA_GERAL, nome: "Geral", total: 1 },
    ]);
  });

  it("sem norma sem disciplina, não há pasta Geral; sem norma nenhuma, não há pasta", () => {
    expect(montarPastas([NBR6118]).map((p) => p.id)).toEqual(["d-est"]);
    expect(montarPastas([])).toEqual([]);
  });

  it("mesma ordem no catálogo desempata pelo nome", () => {
    const a = { id: "a", nome: "Zeta", ordem: 0 };
    const b = { id: "b", nome: "Água", ordem: 0 };
    expect(montarPastas([norma("X", "x", [a, b])]).map((p) => p.nome)).toEqual(["Água", "Zeta"]);
  });
});

describe("normasDaPasta", () => {
  it("sem pasta = todas", () => {
    expect(normasDaPasta(TODAS, null)).toEqual(TODAS);
  });

  it("norma de várias disciplinas aparece em cada pasta dela", () => {
    expect(normasDaPasta(TODAS, "d-est")).toEqual([NBR6118, NBR15575]);
    expect(normasDaPasta(TODAS, "d-arq")).toEqual([NBR15575]);
  });

  it("Geral = só as sem disciplina", () => {
    expect(normasDaPasta(TODAS, PASTA_GERAL)).toEqual([NR18]);
  });

  it("pasta que não existe devolve vazio, não todas", () => {
    expect(normasDaPasta(TODAS, "d-sumiu")).toEqual([]);
  });
});

describe("buscarNormas", () => {
  it("acha por número, título, ano e disciplina, sem acento nem caixa", () => {
    expect(buscarNormas(TODAS, "6118")).toEqual([NBR6118]);
    expect(buscarNormas(TODAS, "AGUA FRIA")).toEqual([NBR5626]);
    expect(buscarNormas(TODAS, "2021")).toEqual([NBR15575]);
    expect(buscarNormas(TODAS, "hidrossanitario")).toEqual([NBR5626, NBR15575]);
  });

  it("termo vazio devolve tudo", () => {
    expect(buscarNormas(TODAS, "   ")).toEqual(TODAS);
  });
});
