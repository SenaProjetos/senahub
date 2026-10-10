import { describe, expect, it, vi } from "vitest";
import { ViewerEngine } from "@/modules/coordenacao/viewer/engine";

type CaixaThree = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

function caixa(min: [number, number, number], max: [number, number, number]): CaixaThree {
  return {
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
  };
}

function modelo(idsComGeometria: number[], caixas: Map<number, CaixaThree>, categorias: string[] = []) {
  return {
    getSpatialStructure: vi.fn().mockResolvedValue({ category: "IFCPROJECT", localId: null, children: [] }),
    getItemsIdsWithGeometry: vi.fn().mockResolvedValue(idsComGeometria),
    getItemsWithGeometryCategories: vi.fn().mockResolvedValue(categorias),
    getItemsData: vi.fn().mockResolvedValue([]),
    object: { updateWorldMatrix: vi.fn() },
    getBoxes: vi.fn().mockImplementation(async (ids: number[]) => ids.map((id) => caixas.get(id)!)),
  };
}

function engineCom(modelos: Record<string, ReturnType<typeof modelo>>) {
  const engine = Object.create(ViewerEngine.prototype) as ViewerEngine;
  Object.defineProperties(engine, {
    modelos: { value: new Map(Object.entries(modelos)) },
    indiceCache: { value: new Map() },
  });
  return engine;
}

describe("ViewerEngine.detectarConflitos", () => {
  it("inclui produtos MEP com geometria mesmo fora da árvore espacial", async () => {
    const drenagem = modelo([10, 10], new Map([[10, caixa([0, 0, 0], [2, 2, 2])]]), ["IFCPIPESEGMENT"]);
    const eletrica = modelo([20], new Map([[20, caixa([1, 1, 1], [3, 3, 3])]]), ["IFCCABLECARRIERSEGMENT"]);
    const engine = engineCom({ drenagem, eletrica });

    const conflitos = await engine.detectarConflitos("drenagem", "eletrica");

    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatchObject({
      localIdA: 10,
      localIdB: 20,
      metodo: "aabb",
      categoriaA: "IFCPIPESEGMENT",
      categoriaB: "IFCCABLECARRIERSEGMENT",
    });
    expect(drenagem.getItemsIdsWithGeometry).toHaveBeenCalledOnce();
    expect(eletrica.getItemsIdsWithGeometry).toHaveBeenCalledOnce();
    expect(drenagem.getBoxes).toHaveBeenCalledWith([10]);
  });

  it("deixa ambiente (IfcSpace) fora do clash", async () => {
    const arq = modelo(
      [1, 2],
      new Map([
        [1, caixa([0, 0, 0], [10, 10, 3])],
        [2, caixa([20, 20, 20], [21, 21, 21])],
      ]),
      ["IFCSPACE", "IFCWALL"],
    );
    const est = modelo([30], new Map([[30, caixa([1, 1, 1], [2, 2, 2])]]), ["IFCBEAM"]);
    const engine = engineCom({ arq, est });

    const conflitos = await engine.detectarConflitos("arq", "est");

    expect(conflitos).toEqual([]);
    expect(arq.getBoxes).toHaveBeenCalledWith([2]);
  });
});

describe("ViewerEngine.indiceDoModelo", () => {
  it("indexa itens com geometria quando a árvore espacial vem vazia", async () => {
    const model = {
      getSpatialStructure: vi.fn().mockResolvedValue({
        category: "IFCPROJECT",
        localId: 1,
        children: [],
      }),
      getItemsIdsWithGeometry: vi.fn().mockResolvedValue([10, 10, 20]),
      getItemsWithGeometryCategories: vi
        .fn()
        .mockResolvedValue(["IFCPIPESEGMENT", "IFCPIPESEGMENT", "IFCPIPEFITTING"]),
    };
    const engine = Object.create(ViewerEngine.prototype) as ViewerEngine;
    Object.defineProperties(engine, {
      modelos: { value: new Map([["hidrossanitario", model]]) },
      indiceCache: { value: new Map() },
    });

    const elementos = await engine.indiceDoModelo("hidrossanitario");

    expect(elementos).toEqual([
      {
        localId: 10,
        category: "IFCPIPESEGMENT",
        pavimentoLocalId: null,
        pavimentoNome: null,
      },
      {
        localId: 20,
        category: "IFCPIPEFITTING",
        pavimentoLocalId: null,
        pavimentoNome: null,
      },
    ]);
    expect(model.getItemsIdsWithGeometry).toHaveBeenCalledOnce();
  });
});
