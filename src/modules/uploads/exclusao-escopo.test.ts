import { describe, it, expect } from "vitest";
import { chaveGrupo, temDocumento, agruparPorDocumento, expandirSelecao } from "./exclusao-escopo";

describe("chaveGrupo", () => {
  it("usa o documento canônico quando existe (apelido de merge não forma grupo próprio)", () => {
    expect(chaveGrupo({ id: "u1", documentoId: "apelido", documentoCanonicoId: "canonico" })).toBe("canonico");
  });

  it("cai no documentoId quando não houve merge", () => {
    expect(chaveGrupo({ id: "u1", documentoId: "doc", documentoCanonicoId: null })).toBe("doc");
  });

  it("arquivo solto (sem documento) vira grupo de si mesmo", () => {
    expect(chaveGrupo({ id: "u1", documentoId: null })).toBe("solto:u1");
  });

  it("dois arquivos soltos NÃO caem no mesmo grupo", () => {
    const a = chaveGrupo({ id: "u1", documentoId: null });
    const b = chaveGrupo({ id: "u2", documentoId: null });
    expect(a).not.toBe(b);
  });
});

describe("temDocumento", () => {
  it("falso só quando não há documento nem canônico", () => {
    expect(temDocumento({ id: "u1", documentoId: null })).toBe(false);
    expect(temDocumento({ id: "u1", documentoId: "d" })).toBe(true);
    expect(temDocumento({ id: "u1", documentoId: null, documentoCanonicoId: "c" })).toBe(true);
  });
});

describe("agruparPorDocumento", () => {
  it("junta as revisões do mesmo documento num grupo só", () => {
    const grupos = agruparPorDocumento([
      { id: "pdf-r1", documentoId: "doc" },
      { id: "dwg-r1", documentoId: "doc" },
      { id: "pdf-r2", documentoId: "doc" },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].documentoId).toBe("doc");
    expect(grupos[0].linhas.map((l) => l.id)).toEqual(["pdf-r1", "dwg-r1", "pdf-r2"]);
  });

  it("apelido de merge cai no MESMO grupo do canônico — senão sobraria ponta solta", () => {
    const grupos = agruparPorDocumento([
      { id: "u1", documentoId: "canonico" },
      { id: "u2", documentoId: "apelido", documentoCanonicoId: "canonico" },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].linhas.map((l) => l.id)).toEqual(["u1", "u2"]);
  });

  it("preserva a ordem de entrada entre grupos (primeira aparição) e dentro deles", () => {
    const grupos = agruparPorDocumento([
      { id: "b1", documentoId: "docB" },
      { id: "a1", documentoId: "docA" },
      { id: "b2", documentoId: "docB" },
    ]);
    expect(grupos.map((g) => g.documentoId)).toEqual(["docB", "docA"]);
    expect(grupos[0].linhas.map((l) => l.id)).toEqual(["b1", "b2"]);
  });

  it("arquivos soltos viram grupos separados, com documentoId nulo", () => {
    const grupos = agruparPorDocumento([
      { id: "u1", documentoId: null },
      { id: "u2", documentoId: null },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.documentoId === null)).toBe(true);
  });

  it("lista vazia devolve nenhum grupo", () => {
    expect(agruparPorDocumento([])).toEqual([]);
  });
});

describe("expandirSelecao", () => {
  const irmaos = new Map([["doc", ["r1", "r2", "r3"]]]);

  it('escopo "revisão" (nenhum documento inteiro) não puxa irmão nenhum', () => {
    expect(expandirSelecao(["r3"], [], irmaos)).toEqual(["r3"]);
  });

  it('escopo "documento" puxa todas as revisões vivas', () => {
    expect(expandirSelecao(["r3"], ["doc"], irmaos)).toEqual(["r3", "r1", "r2"]);
  });

  it("não duplica quando o irmão já estava selecionado", () => {
    expect(expandirSelecao(["r1", "r3"], ["doc"], irmaos)).toEqual(["r1", "r3", "r2"]);
  });

  it("mistura escolhas diferentes por documento na mesma seleção", () => {
    const mapa = new Map([
      ["docA", ["a1", "a2"]],
      ["docB", ["b1", "b2"]],
    ]);
    // docA vai inteiro; de docB só a linha marcada.
    expect(expandirSelecao(["a2", "b2"], ["docA"], mapa)).toEqual(["a2", "b2", "a1"]);
  });

  it("documento sem irmãos conhecidos degrada para a seleção — nunca esvazia a intenção", () => {
    expect(expandirSelecao(["x1"], ["docFantasma"], new Map())).toEqual(["x1"]);
  });

  it("seleção vazia com documento inteiro ainda leva os irmãos", () => {
    expect(expandirSelecao([], ["doc"], irmaos)).toEqual(["r1", "r2", "r3"]);
  });

  it("é estável: mesma entrada, mesma ordem de saída", () => {
    const a = expandirSelecao(["r3", "r1"], ["doc"], irmaos);
    const b = expandirSelecao(["r3", "r1"], ["doc"], irmaos);
    expect(a).toEqual(b);
  });
});
