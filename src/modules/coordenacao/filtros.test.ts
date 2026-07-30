import { describe, expect, it } from "vitest";
import {
  aplicarFiltro,
  buscarPsets,
  filtroVazio,
  localIdsVisiveis,
  psetsDistintos,
} from "@/modules/coordenacao/filtros";
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

const elementos: ElementoIndex[] = [
  {
    localId: 100,
    category: "IFCWALL",
    pavimentoLocalId: 10,
    pavimentoNome: "Térreo",
    propriedades: [
      { pset: "Pset_WallCommon", nome: "IsExternal", valor: "true" },
      { pset: "SENA", nome: "Fase", valor: "Executivo" },
    ],
  },
  {
    localId: 101,
    category: "IFCWALL",
    pavimentoLocalId: 20,
    pavimentoNome: "1º Pav.",
    propriedades: [{ pset: "Pset_WallCommon", nome: "IsExternal", valor: "false" }],
  },
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
    expect(filtroVazio({ psets: [{ pset: "SENA", nome: "Fase", valor: "Executivo" }] })).toBe(false);
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

  it("filtra por valor de Pset", () => {
    const r = aplicarFiltro(elementos, {
      psets: [{ pset: "Pset_WallCommon", nome: "IsExternal", valor: "true" }],
    });
    expect(r.map((e) => e.localId)).toEqual([100]);
  });

  it("combina múltiplos Psets com AND", () => {
    const r = aplicarFiltro(elementos, {
      psets: [
        { pset: "Pset_WallCommon", nome: "IsExternal", valor: "true" },
        { pset: "SENA", nome: "Fase", valor: "Executivo" },
      ],
    });
    expect(r.map((e) => e.localId)).toEqual([100]);
  });
});

describe("localIdsVisiveis", () => {
  it("retorna só os localIds", () => {
    expect(localIdsVisiveis(elementos, { categorias: ["IFCBEAM"] })).toEqual([102]);
  });
});

describe("psetsDistintos", () => {
  it("remove duplicados e ordena as opções disponíveis", () => {
    const r = psetsDistintos([
      ...elementos,
      {
        localId: 999,
        category: "IFCWALL",
        pavimentoLocalId: 10,
        pavimentoNome: "Térreo",
        propriedades: [{ pset: "SENA", nome: "Fase", valor: "Executivo" }],
      },
    ]);
    expect(r).toEqual([
      { pset: "Pset_WallCommon", nome: "IsExternal", valor: "false" },
      { pset: "Pset_WallCommon", nome: "IsExternal", valor: "true" },
      { pset: "SENA", nome: "Fase", valor: "Executivo" },
    ]);
  });
});

describe("buscarPsets", () => {
  const opcoes = [
    { pset: "Pset_WallCommon", nome: "IsExternal", valor: "true" },
    { pset: "SENA", nome: "Fase", valor: "Executivo" },
    { pset: "SENA", nome: "Fase", valor: "Anteprojeto" },
  ];

  it("busca em Pset, nome e valor sem diferenciar acentos/caixa", () => {
    expect(buscarPsets(opcoes, "EXECUTIVO").itens).toEqual([opcoes[1]]);
    expect(buscarPsets(opcoes, "anteprojéto").itens).toEqual([opcoes[2]]);
  });

  it("limita a lista renderizada sem perder a contagem total", () => {
    expect(buscarPsets(opcoes, "", 2)).toEqual({ itens: opcoes.slice(0, 2), total: 3 });
  });
});
