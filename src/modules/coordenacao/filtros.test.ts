import { describe, expect, it } from "vitest";
import {
  aplicarFiltroMulti,
  chavePavimento,
  localIdsPorModelo,
  pavimentosUnificados,
  SEM_PAVIMENTO,
  type ElementoDeModelo,
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

describe("filtro em vários modelos", () => {
  const el = (
    modeloId: string,
    localId: number,
    category: string,
    pavimentoNome: string | null,
    pavimentoElevacao: number | null = null,
  ): ElementoDeModelo => ({
    modeloId,
    localId,
    category,
    pavimentoLocalId: pavimentoNome ? 1 : null,
    pavimentoNome,
    pavimentoElevacao,
  });
  const elementos = [
    el("ARQ", 1, "IFCWALL", "TÉRREO", 0),
    el("ARQ", 2, "IFCSLAB", "1 PAV", 3500),
    el("ARQ", 3, "IFCSLAB", "Cobertura", 7000),
    el("EST", 10, "IFCBEAM", "Térreo ", 0),
    el("EST", 11, "IFCBEAM", "1 pav", 3500),
    el("EST", 12, "IFCCOLUMN", null),
  ];

  it("une pavimentos de modelos diferentes pelo nome (sem caixa nem espaço)", () => {
    const pavs = pavimentosUnificados(elementos);
    expect(pavs.map((p) => [p.nome, p.total, p.modelos])).toEqual([
      ["TÉRREO", 2, 2],
      ["1 PAV", 2, 2],
      ["Cobertura", 1, 1],
      [null, 1, 1],
    ]);
  });

  it("ordena pela cota, de baixo para cima, e deixa sem cota e sem pavimento no fim", () => {
    const pavs = pavimentosUnificados([
      el("A", 1, "IFCWALL", "Ático", null),
      el("A", 2, "IFCWALL", "Subsolo", -3000),
      el("A", 3, "IFCWALL", null),
      el("A", 4, "IFCWALL", "Térreo", 0),
    ]);
    expect(pavs.map((p) => p.nome)).toEqual(["Subsolo", "Térreo", "Ático", null]);
  });

  it("isola o andar em todos os modelos, cada um com seus localIds", () => {
    const mapa = localIdsPorModelo(elementos, { pavimentos: [chavePavimento("térreo")] }, ["ARQ", "EST", "MEP"]);
    expect(Object.fromEntries(mapa)).toEqual({ ARQ: [1], EST: [10], MEP: [] });
  });

  it("combina pavimento e categoria (AND) entre modelos", () => {
    const r = aplicarFiltroMulti(elementos, {
      pavimentos: [chavePavimento("1 PAV")],
      categorias: ["IFCBEAM"],
    });
    expect(r.map((e) => `${e.modeloId}:${e.localId}`)).toEqual(["EST:11"]);
  });

  it("'Sem pavimento' é filtrável pela chave própria", () => {
    const r = aplicarFiltroMulti(elementos, { pavimentos: [SEM_PAVIMENTO] });
    expect(r.map((e) => e.localId)).toEqual([12]);
  });
});
