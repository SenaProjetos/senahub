import { describe, expect, it } from "vitest";
import { escolherClausula, type ClausulaCandidata } from "./clausulas";

const c = (id: string, extra: Partial<ClausulaCandidata> = {}): ClausulaCandidata => ({
  id,
  secao: "ESCOPO",
  disciplinaId: null,
  uf: null,
  ordem: 0,
  ativo: true,
  ...extra,
});
const id = (r: ClausulaCandidata | undefined) => r?.id;

describe("escolherClausula — UF", () => {
  const pci = [
    c("generica", { secao: "PCI", ordem: 1 }),
    c("pe", { secao: "PCI", uf: "PE", ordem: 2 }),
  ];

  it("prefere a variante da UF da obra", () => {
    expect(id(escolherClausula(pci, "PCI", null, "PE"))).toBe("pe");
  });

  it("cai na genérica quando a UF da obra não tem variante", () => {
    expect(id(escolherClausula(pci, "PCI", null, "SP"))).toBe("generica");
  });

  it("o caso real de Milagres/AL: obra em AL nunca recebe o COSCIP de Pernambuco", () => {
    expect(id(escolherClausula(pci, "PCI", null, "AL"))).not.toBe("pe");
    // …e sem genérica, a resposta é "nenhuma" — jamais a de PE.
    const soPe = [c("pe", { secao: "PCI", uf: "PE" })];
    expect(escolherClausula(soPe, "PCI", null, "AL")).toBeUndefined();
  });

  it("UF da obra ausente só enxerga genéricas", () => {
    expect(id(escolherClausula(pci, "PCI", null, null))).toBe("generica");
    expect(id(escolherClausula(pci, "PCI", null, ""))).toBe("generica");
    expect(id(escolherClausula(pci, "PCI", null, undefined))).toBe("generica");
  });

  it("ignora caixa e espaços na UF", () => {
    expect(id(escolherClausula(pci, "PCI", null, " pe "))).toBe("pe");
    expect(id(escolherClausula([c("pe", { secao: "PCI", uf: "pe" })], "PCI", null, "PE"))).toBe("pe");
  });
});

describe("escolherClausula — disciplina", () => {
  const escopo = [
    c("geral", { ordem: 1 }),
    c("estrutural", { disciplinaId: "d-est", ordem: 2 }),
    c("eletrica", { disciplinaId: "d-ele", ordem: 3 }),
  ];

  it("escolhe a cláusula da disciplina pedida", () => {
    expect(id(escolherClausula(escopo, "ESCOPO", "d-est", null))).toBe("estrutural");
    expect(id(escolherClausula(escopo, "ESCOPO", "d-ele", null))).toBe("eletrica");
  });

  it("disciplina sem cláusula própria cai na geral da seção", () => {
    expect(id(escolherClausula(escopo, "ESCOPO", "d-hid", null))).toBe("geral");
  });

  it("sem disciplina na chamada, o escopo de uma disciplina não entra na seção geral", () => {
    expect(id(escolherClausula(escopo, "ESCOPO", null, null))).toBe("geral");
    expect(escolherClausula([c("estrutural", { disciplinaId: "d-est" })], "ESCOPO", null, null)).toBeUndefined();
  });

  it("nunca devolve a cláusula de OUTRA disciplina", () => {
    expect(escolherClausula([c("estrutural", { disciplinaId: "d-est" })], "ESCOPO", "d-ele", null)).toBeUndefined();
  });
});

describe("escolherClausula — as duas dimensões juntas", () => {
  it("disciplina + UF exatas vencem qualquer genérica", () => {
    const lista = [
      c("geral", { ordem: 0 }),
      c("est", { disciplinaId: "d", ordem: 1 }),
      c("est-pe", { disciplinaId: "d", uf: "PE", ordem: 2 }),
    ];
    expect(id(escolherClausula(lista, "ESCOPO", "d", "PE"))).toBe("est-pe");
    expect(id(escolherClausula(lista, "ESCOPO", "d", "AL"))).toBe("est");
  });

  it("quando puxam para lados diferentes, a disciplina pesa mais que a UF", () => {
    const lista = [c("da-disciplina", { disciplinaId: "d", ordem: 9 }), c("da-uf", { uf: "PE", ordem: 1 })];
    expect(id(escolherClausula(lista, "ESCOPO", "d", "PE"))).toBe("da-disciplina");
  });
});

describe("escolherClausula — filtros e desempate", () => {
  it("só considera cláusulas ativas da seção pedida", () => {
    const lista = [c("inativa", { ativo: false }), c("outra-secao", { secao: "NAO_INCLUSO" })];
    expect(escolherClausula(lista, "ESCOPO", null, null)).toBeUndefined();
  });

  it("empate: menor ordem; persistindo, menor id — resultado determinístico", () => {
    expect(id(escolherClausula([c("b", { ordem: 2 }), c("a", { ordem: 1 })], "ESCOPO", null, null))).toBe("a");
    expect(id(escolherClausula([c("z", { ordem: 1 }), c("m", { ordem: 1 })], "ESCOPO", null, null))).toBe("m");
  });

  it("não depende da ordem da lista recebida e não a modifica", () => {
    const lista = [c("b", { ordem: 2 }), c("a", { ordem: 1 })];
    const copia = [...lista];
    escolherClausula(lista, "ESCOPO", null, null);
    expect(lista).toEqual(copia);
    expect(id(escolherClausula([...lista].reverse(), "ESCOPO", null, null))).toBe("a");
  });

  it("lista vazia devolve undefined", () => {
    expect(escolherClausula([], "ESCOPO", "d", "PE")).toBeUndefined();
  });
});
