import { describe, expect, it } from "vitest";
import { ancestraisDe, motivoCategoriaIncompativel, motivoCategoriaInvalida, type CategoriaDaArvore } from "@/modules/financeiro/categorias-regras";

const arvore = new Map<string, CategoriaDaArvore>([
  ["2", { id: "2", paiId: null, tipo: "despesa" }],
  ["2.01", { id: "2.01", paiId: "2", tipo: "despesa" }],
  ["2.01.a", { id: "2.01.a", paiId: "2.01", tipo: "despesa" }],
  ["1", { id: "1", paiId: null, tipo: "receita" }],
]);

describe("categoria × lançamento", () => {
  it("só do mesmo tipo", () => {
    expect(motivoCategoriaIncompativel("despesa", "despesa")).toBeNull();
    expect(motivoCategoriaIncompativel("despesa", "receita")).toContain("de receita");
    expect(motivoCategoriaIncompativel("receita", "despesa")).toContain("de despesa");
  });
});

describe("motivoCategoriaInvalida", () => {
  it("ancestrais, sem laço infinito", () => {
    expect(ancestraisDe("2.01.a", arvore)).toEqual(["2.01", "2"]);
    const laco = new Map<string, CategoriaDaArvore>([["a", { id: "a", paiId: "b", tipo: "despesa" }], ["b", { id: "b", paiId: "a", tipo: "despesa" }]]);
    expect(ancestraisDe("a", laco)).toEqual(["b", "a"]);
  });
  it("tipo de categoria em uso não muda; sem uso, muda; do sistema nunca", () => {
    const base = { id: "2.01", tipo: "receita" as const, tipoAtual: "despesa" as const, paiId: null, porId: arvore };
    expect(motivoCategoriaInvalida({ ...base, lancamentos: 3 })).toContain("3 lançamento(s)");
    expect(motivoCategoriaInvalida({ ...base, lancamentos: 0 })).toBeNull();
    expect(motivoCategoriaInvalida({ ...base, lancamentos: 0, doSistema: true })).toContain("Categoria do sistema");
  });
  it("pai: ela mesma, descendente (círculo), de outro tipo ou inexistente", () => {
    const e = { id: "2", tipo: "despesa" as const, porId: arvore };
    expect(motivoCategoriaInvalida({ ...e, paiId: "2" })).toContain("dela mesma");
    expect(motivoCategoriaInvalida({ ...e, paiId: "2.01.a" })).toContain("em círculo");
    expect(motivoCategoriaInvalida({ ...e, paiId: "1" })).toContain("mesmo tipo");
    expect(motivoCategoriaInvalida({ ...e, paiId: "zzz" })).toContain("não encontrada");
  });
  it("categoria nova com pai do mesmo tipo passa", () => {
    expect(motivoCategoriaInvalida({ tipo: "despesa", paiId: "2.01", porId: arvore })).toBeNull();
  });
});
