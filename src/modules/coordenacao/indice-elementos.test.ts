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
  it("lista pavimentos únicos na ordem de aparição", () => {
    const elementos = listarElementos(normalizarNo(arvoreBruta));
    const pav = pavimentosDistintos(elementos);
    expect(pav).toEqual([
      { localId: 10, nome: "IFCBUILDINGSTOREY" },
      { localId: 20, nome: "IFCBUILDINGSTOREY" },
    ]);
  });
});

describe("categoriasDistintas", () => {
  it("lista categorias únicas ordenadas", () => {
    const elementos = listarElementos(normalizarNo(arvoreBruta));
    expect(categoriasDistintas(elementos)).toEqual(["IFCBEAM", "IFCCOLUMN", "IFCWALL"]);
  });
});
