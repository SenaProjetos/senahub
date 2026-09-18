import { describe, expect, it } from "vitest";
import {
  EXT_OUTROS,
  FASE_SEM,
  FASE_TODAS,
  montarArvoreNavegacao,
  montarPastasDeArquivos,
  type DocumentoParaArvore,
} from "./arvore-navegacao";

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
      { chave: "dwg", rotulo: "DWG", total: 1, totalArquivos: 1 },
      { chave: "pdf", rotulo: "PDF", total: 2, totalArquivos: 2 },
    ]);
  });

  it("documento com duas extensões conta 1 na fase e 1 em cada extensão", () => {
    const [{ fases }] = montarArvoreNavegacao([doc({ id: "1", extensoes: ["pdf", "dwg"] })], CONHECIDAS);
    expect(fases[0].total).toBe(1);
    expect(fases[0].extensoes.map((e) => e.total)).toEqual([1, 1]);
  });

  it("conta ARQUIVOS além de documentos — é o número que decide se a pasta cabe num .zip", () => {
    const [{ fases }] = montarArvoreNavegacao(
      [doc({ id: "1", extensoes: ["pdf", "dwg"] }), doc({ id: "2", extensoes: ["pdf"] })],
      CONHECIDAS,
    );
    expect(fases[0].total).toBe(2);
    expect(fases[0].totalArquivos).toBe(3);
    expect(fases[0].extensoes.find((e) => e.chave === "pdf")).toMatchObject({ total: 2, totalArquivos: 2 });
    expect(fases[0].extensoes.find((e) => e.chave === "dwg")).toMatchObject({ total: 1, totalArquivos: 1 });
  });

  it("dois arquivos da MESMA extensão contam 1 documento e 2 arquivos", () => {
    const [{ fases }] = montarArvoreNavegacao([doc({ id: "1", extensoes: ["pdf", "pdf"] })], CONHECIDAS);
    expect(fases[0].extensoes).toEqual([{ chave: "pdf", rotulo: "PDF", total: 1, totalArquivos: 2 }]);
    expect(fases[0].totalArquivos).toBe(2);
  });

  it("arquivo sem extensão entra na contagem de arquivos, não some", () => {
    // O nome sem ponto vira entrada vazia e cai em "Outros": se fosse filtrado, o botão de
    // baixar prometeria menos arquivos do que o .zip realmente leva.
    const [{ fases }] = montarArvoreNavegacao([doc({ id: "1", extensoes: ["pdf", ""] })], CONHECIDAS);
    expect(fases[0].totalArquivos).toBe(2);
    expect(fases[0].extensoes.find((e) => e.chave === EXT_OUTROS)).toMatchObject({ total: 1, totalArquivos: 1 });
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
    expect(fases[0].extensoes).toEqual([{ chave: "pdf", rotulo: "PDF", total: 2, totalArquivos: 2 }]);
  });
});

describe("montarPastasDeArquivos", () => {
  const arq = (nome: string, faseId: string | null = "f-ex") => ({
    nome,
    faseId,
    faseSigla: faseId ? "EX" : null,
    faseNome: faseId ? "Projeto Executivo" : null,
  });

  it("põe cada arquivo em uma pasta só, e o total da fase fecha com a soma dos formatos", () => {
    const [fase] = montarPastasDeArquivos([arq("a.pdf"), arq("a.dwg"), arq("b.pdf")], CONHECIDAS);
    expect(fase.total).toBe(3);
    expect(fase.extensoes.map((e) => [e.rotulo, e.total])).toEqual([
      ["DWG", 1],
      ["PDF", 2],
    ]);
    expect(fase.extensoes.reduce((n, e) => n + e.total, 0)).toBe(fase.total);
  });

  it("usa as mesmas pastas Sem fase e Outros da árvore de navegação", () => {
    const pastas = montarPastasDeArquivos([arq("x.ed3"), arq("y.pdf", null), arq("z")], CONHECIDAS);
    expect(pastas.map((p) => p.chave).sort()).toEqual([FASE_SEM, "f-ex"]);
    const ex = pastas.find((p) => p.chave === "f-ex");
    expect(ex?.extensoes.map((e) => e.rotulo)).toEqual(["Outros"]);
    expect(ex?.extensoes[0].arquivos.map((a) => a.nome)).toEqual(["x.ed3", "z"]);
  });
});

describe("montarPastasDeArquivos sem agrupar por fase", () => {
  const arq = (nome: string, faseId: string | null) => ({
    nome,
    faseId,
    faseSigla: faseId ? "EX" : null,
    faseNome: faseId ? "Projeto Executivo" : null,
  });

  it("junta tudo numa pasta só, que a página do cliente não desenha", () => {
    const pastas = montarPastasDeArquivos(
      [arq("a.pdf", "f-ex"), arq("b.pdf", null), arq("c.dwg", "f-bs")],
      CONHECIDAS,
      { agruparPorFase: false },
    );
    expect(pastas).toHaveLength(1);
    expect(pastas[0].chave).toBe(FASE_TODAS);
    expect(pastas[0].total).toBe(3);
    expect(pastas[0].extensoes.map((e) => [e.rotulo, e.total])).toEqual([
      ["DWG", 1],
      ["PDF", 2],
    ]);
  });

  it("ligado (padrão) continua separando as fases", () => {
    const pastas = montarPastasDeArquivos([arq("a.pdf", "f-ex"), arq("b.pdf", null)], CONHECIDAS);
    expect(pastas.map((p) => p.chave).sort()).toEqual([FASE_SEM, "f-ex"]);
  });
});
