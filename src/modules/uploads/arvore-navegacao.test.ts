import { describe, expect, it } from "vitest";
import { EXT_OUTROS, FASE_SEM, montarArvoreNavegacao, type DocumentoParaArvore } from "./arvore-navegacao";

const CONHECIDAS = ["pdf", "dwg", "ifc", "xlsx"];

function doc(parcial: Partial<DocumentoParaArvore> & { id: string }): DocumentoParaArvore {
  return {
    disciplinaId: "d-dre",
    faseId: "f-ex",
    faseSigla: "EX",
    faseNome: "Projeto Executivo",
    extensoes: ["pdf"],
    ...parcial,
  };
}

describe("montarArvoreNavegacao", () => {
  it("agrupa disciplina → fase → extensão", () => {
    const arvore = montarArvoreNavegacao(
      [
        doc({ id: "1", extensoes: ["pdf", "dwg"] }),
        doc({ id: "2", extensoes: ["pdf"] }),
        doc({ id: "3", disciplinaId: "d-hid", extensoes: ["ifc"] }),
      ],
      CONHECIDAS,
    );
    expect(arvore).toHaveLength(2);
    const dre = arvore.find((a) => a.disciplinaId === "d-dre");
    expect(dre?.fases).toHaveLength(1);
    expect(dre?.fases[0]).toMatchObject({ chave: "f-ex", rotulo: "EX", total: 2 });
    expect(dre?.fases[0].extensoes).toEqual([
      { chave: "dwg", rotulo: "DWG", total: 1 },
      { chave: "pdf", rotulo: "PDF", total: 2 },
    ]);
  });

  it("documento com duas extensões conta 1 na fase e 1 em cada extensão", () => {
    const [{ fases }] = montarArvoreNavegacao([doc({ id: "1", extensoes: ["pdf", "dwg"] })], CONHECIDAS);
    expect(fases[0].total).toBe(1);
    expect(fases[0].extensoes.map((e) => e.total)).toEqual([1, 1]);
  });

  it("extensão fora do catálogo e arquivo sem extensão caem em Outros", () => {
    const [{ fases }] = montarArvoreNavegacao(
      [doc({ id: "1", extensoes: ["ed3"] }), doc({ id: "2", extensoes: [] }), doc({ id: "3", extensoes: ["pdf", "sv$"] })],
      CONHECIDAS,
    );
    const outros = fases[0].extensoes.find((e) => e.chave === EXT_OUTROS);
    expect(outros).toMatchObject({ rotulo: "Outros", total: 3 });
    expect(fases[0].extensoes.find((e) => e.chave === "pdf")?.total).toBe(1);
  });

  it("documento sem fase vira um nó próprio, com chave de filtro reservada", () => {
    const [{ fases }] = montarArvoreNavegacao(
      [doc({ id: "1" }), doc({ id: "2", faseId: null, faseSigla: null, faseNome: null })],
      CONHECIDAS,
    );
    expect(fases.map((f) => f.chave).sort()).toEqual([FASE_SEM, "f-ex"]);
    expect(fases.find((f) => f.chave === FASE_SEM)).toMatchObject({ rotulo: "Sem fase", total: 1 });
  });

  it("nada vazio: fase e extensão só existem quando têm documento", () => {
    expect(montarArvoreNavegacao([], CONHECIDAS)).toEqual([]);
    const [{ fases }] = montarArvoreNavegacao([doc({ id: "1", extensoes: ["pdf"] })], CONHECIDAS);
    expect(fases[0].extensoes.map((e) => e.chave)).toEqual(["pdf"]);
  });

  it("caixa da extensão não cria pasta duplicada", () => {
    const [{ fases }] = montarArvoreNavegacao(
      [doc({ id: "1", extensoes: ["PDF"] }), doc({ id: "2", extensoes: ["pdf"] })],
      CONHECIDAS,
    );
    expect(fases[0].extensoes).toEqual([{ chave: "pdf", rotulo: "PDF", total: 2 }]);
  });
});
