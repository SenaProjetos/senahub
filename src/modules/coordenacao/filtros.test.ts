import { describe, expect, it } from "vitest";
import { aplicarFiltro, filtroVazio, localIdsVisiveis } from "@/modules/coordenacao/filtros";
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

const elementos: ElementoIndex[] = [
  { localId: 100, category: "IFCWALL", pavimentoLocalId: 10, pavimentoNome: "Térreo" },
  { localId: 101, category: "IFCWALL", pavimentoLocalId: 20, pavimentoNome: "1º Pav." },
  { localId: 102, category: "IFCBEAM", pavimentoLocalId: 10, pavimentoNome: "Térreo" },
  { localId: 103, category: "IFCCOLUMN", pavimentoLocalId: null, pavimentoNome: null },
];

describe("filtroVazio", () => {
  it("true quando nenhum critério definido", () => {
    expect(filtroVazio({})).toBe(true);
  });
  it("false quando algum critério definido", () => {
    expect(filtroVazio({ pavimentos: [10] })).toBe(false);
    expect(filtroVazio({ categorias: ["IFCWALL"] })).toBe(false);
  });
});

describe("aplicarFiltro", () => {
  it("filtro vazio retorna todos", () => {
    expect(aplicarFiltro(elementos, {})).toEqual(elementos);
  });

  it("filtra só por pavimento", () => {
    const r = aplicarFiltro(elementos, { pavimentos: [10] });
    expect(r.map((e) => e.localId)).toEqual([100, 102]);
  });

  it("filtra por pavimento null (sem pavimento)", () => {
    const r = aplicarFiltro(elementos, { pavimentos: [null] });
    expect(r.map((e) => e.localId)).toEqual([103]);
  });

  it("filtra só por categoria", () => {
    const r = aplicarFiltro(elementos, { categorias: ["IFCWALL"] });
    expect(r.map((e) => e.localId)).toEqual([100, 101]);
  });

  it("combina pavimento E categoria (AND)", () => {
    const r = aplicarFiltro(elementos, { pavimentos: [10], categorias: ["IFCWALL"] });
    expect(r.map((e) => e.localId)).toEqual([100]);
  });

  it("critério sem correspondência retorna vazio", () => {
    expect(aplicarFiltro(elementos, { categorias: ["IFCDOOR"] })).toEqual([]);
  });
});

describe("localIdsVisiveis", () => {
  it("retorna só os localIds", () => {
    expect(localIdsVisiveis(elementos, { categorias: ["IFCBEAM"] })).toEqual([102]);
  });
});
