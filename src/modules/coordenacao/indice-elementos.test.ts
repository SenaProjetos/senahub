import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  agruparPorPavimento,
  categoriasDistintas,
  listarElementos,
  normalizarNo,
  pavimentosDistintos,
  type NoArvoreBruto,
} from "@/modules/coordenacao/indice-elementos";

// Árvore de exemplo: Project → Site → Building → 2 Storeys → paredes/vigas.
const arvoreBruta: NoArvoreBruto = {
  category: "IFCPROJECT",
  localId: 1,
  children: [
    {
      category: "IFCSITE",
      localId: 2,
      children: [
        {
          category: "IFCBUILDING",
          localId: 3,
          children: [
            {
              category: "IFCBUILDINGSTOREY",
              localId: 10,
              children: [
                { category: "IFCWALL", localId: 100, children: [] },
                { category: "IFCWALL", localId: 101, children: [] },
                { category: "IFCBEAM", localId: 102 }, // sem children (undefined)
              ],
            },
            {
              category: "IFCBUILDINGSTOREY",
              localId: 20,
              children: [{ category: "IFCCOLUMN", localId: 200, children: [] }],
            },
          ],
        },
      ],
    },
  ],
};

// Forma REAL do fragments 3.x (conferida em .frag de Revit, 2026-10-09): a árvore
// alterna nós de GRUPO (category preenchida, localId null) e nós de ITEM (localId
// preenchido, category null). O item herda a categoria do grupo logo acima.
const arvoreAgrupada: NoArvoreBruto = {
  category: "IFCPROJECT",
  localId: null,
  children: [
    {
      category: null,
      localId: 18,
      children: [
        {
          category: "IFCSITE",
          localId: null,
          children: [
            {
              category: null,
              localId: 387,
              children: [
                {
                  category: "IFCBUILDINGSTOREY",
                  localId: null,
                  children: [
                    {
                      category: null,
                      localId: 25,
                      children: [
                        {
                          category: "IFCDOOR",
                          localId: null,
                          children: [
                            { category: null, localId: 1001, children: [] },
                            { category: null, localId: 1002, children: [] },
                          ],
                        },
                        {
                          category: "IFCSTAIR",
                          localId: null,
                          children: [
                            {
                              category: null,
                              localId: 1003,
                              // Escada agrega lances: o lance continua no pavimento 25.
                              children: [
                                { category: "IFCSTAIRFLIGHT", localId: null, children: [{ category: null, localId: 1004 }] },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      category: null,
                      localId: 29,
                      children: [
                        { category: "IFCSLAB", localId: null, children: [{ category: null, localId: 2001, children: [] }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("listarElementos — forma agrupada do fragments 3.x", () => {
  const elementos = listarElementos(normalizarNo(arvoreAgrupada));
  const porId = new Map(elementos.map((e) => [e.localId, e]));

  it("acha cada item com a categoria do grupo acima", () => {
    expect(porId.get(1001)?.category).toBe("IFCDOOR");
    expect(porId.get(2001)?.category).toBe("IFCSLAB");
    expect(porId.get(1004)?.category).toBe("IFCSTAIRFLIGHT");
  });

  it("resolve o pavimento pelo localId do item do grupo IFCBUILDINGSTOREY", () => {
    expect(porId.get(1001)?.pavimentoLocalId).toBe(25);
    expect(porId.get(1004)?.pavimentoLocalId).toBe(25);
    expect(porId.get(2001)?.pavimentoLocalId).toBe(29);
  });

  it("não lista projeto, terreno, edifício nem os próprios pavimentos", () => {
    expect([...porId.keys()].sort()).toEqual([1001, 1002, 1003, 1004, 2001]);
  });

  it("pavimentos distintos na ordem da árvore", () => {
    expect(pavimentosDistintos(elementos).map((p) => p.localId)).toEqual([25, 29]);
  });
});

describe("normalizarNo", () => {
  it("children ausente vira array vazio", () => {
    const n = normalizarNo({ category: "IFCBEAM", localId: 102 });
    expect(n.children).toEqual([]);
  });

  it("normaliza recursivamente", () => {
    const n = normalizarNo(arvoreBruta);
    expect(n.children[0].children[0].children.length).toBe(2); // 2 storeys
  });
});

describe("listarElementos", () => {
  const raiz = normalizarNo(arvoreBruta);
  const elementos = listarElementos(raiz);

  it("exclui nós estruturais (project/site/building/storey)", () => {
    const categorias = elementos.map((e) => e.category);
    expect(categorias).not.toContain("IFCPROJECT");
    expect(categorias).not.toContain("IFCSITE");
    expect(categorias).not.toContain("IFCBUILDING");
    expect(categorias).not.toContain("IFCBUILDINGSTOREY");
  });

  it("inclui todos os elementos de obra", () => {
    expect(elementos.map((e) => e.localId).sort()).toEqual([100, 101, 102, 200]);
  });

  it("anota o pavimento ancestral mais próximo", () => {
    const paredes = elementos.filter((e) => e.pavimentoLocalId === 10);
    expect(paredes.map((e) => e.localId).sort()).toEqual([100, 101, 102]);
    const coluna = elementos.find((e) => e.localId === 200);
    expect(coluna?.pavimentoLocalId).toBe(20);
    expect(coluna?.pavimentoNome).toBe("IFCBUILDINGSTOREY");
  });

  it("elemento fora de qualquer storey fica com pavimento null", () => {
    const raizSemStorey = normalizarNo({
      category: "IFCPROJECT",
      localId: 1,
      children: [{ category: "IFCWALL", localId: 999, children: [] }],
    });
    const els = listarElementos(raizSemStorey);
    expect(els[0].pavimentoLocalId).toBeNull();
    expect(els[0].pavimentoNome).toBeNull();
  });

  it("nó sem category ou sem localId não vira elemento", () => {
    const raizEstranha = normalizarNo({
      category: null,
      localId: null,
      children: [
        { category: "IFCWALL", localId: null, children: [] }, // sem localId
        { category: null, localId: 5, children: [] }, // sem category
      ],
    });
    expect(listarElementos(raizEstranha)).toEqual([]);
  });
});

describe("agruparPorPavimento", () => {
  const elementos = listarElementos(normalizarNo(arvoreBruta));

  it("agrupa por pavimentoLocalId", () => {
    const grupos = agruparPorPavimento(elementos);
    expect(grupos.get(10)?.length).toBe(3);
    expect(grupos.get(20)?.length).toBe(1);
  });
});

describe("agruparPorCategoria", () => {
  const elementos = listarElementos(normalizarNo(arvoreBruta));

  it("agrupa por category", () => {
    const grupos = agruparPorCategoria(elementos);
    expect(grupos.get("IFCWALL")?.length).toBe(2);
    expect(grupos.get("IFCBEAM")?.length).toBe(1);
    expect(grupos.get("IFCCOLUMN")?.length).toBe(1);
  });
});

describe("pavimentosDistintos", () => {
  it("sem cota, lista pavimentos únicos na ordem de aparição", () => {
    const elementos = listarElementos(normalizarNo(arvoreBruta));
    const pav = pavimentosDistintos(elementos);
    expect(pav).toEqual([
      { localId: 10, nome: "IFCBUILDINGSTOREY", elevacao: null },
      { localId: 20, nome: "IFCBUILDINGSTOREY", elevacao: null },
    ]);
  });

  it("com cota, ordena de baixo para cima; sem pavimento por último", () => {
    const base = { category: "IFCWALL" };
    const pav = pavimentosDistintos([
      { ...base, localId: 1, pavimentoLocalId: null, pavimentoNome: null },
      { ...base, localId: 2, pavimentoLocalId: 30, pavimentoNome: "Cobertura", pavimentoElevacao: 7000 },
      { ...base, localId: 3, pavimentoLocalId: 10, pavimentoNome: "Térreo", pavimentoElevacao: 0 },
      { ...base, localId: 4, pavimentoLocalId: 20, pavimentoNome: "1 Pav", pavimentoElevacao: 3500 },
    ]);
    expect(pav.map((p) => p.nome)).toEqual(["Térreo", "1 Pav", "Cobertura", null]);
  });
});

describe("categoriasDistintas", () => {
  it("lista categorias únicas ordenadas", () => {
    const elementos = listarElementos(normalizarNo(arvoreBruta));
    expect(categoriasDistintas(elementos)).toEqual(["IFCBEAM", "IFCCOLUMN", "IFCWALL"]);
  });
});
