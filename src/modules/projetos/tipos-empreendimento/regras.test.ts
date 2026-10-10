import { describe, expect, it } from "vitest";
import { NOME_MAX, chaveDoNome, fasesValidas, motivoNaoExcluir, reordenar, validarNome } from "./regras";

describe("validarNome / chaveDoNome", () => {
  it("recusa vazio, só espaços e nome longo demais", () => {
    expect(validarNome("")).toMatch(/Informe/);
    expect(validarNome("   ")).toMatch(/Informe/);
    expect(validarNome("x".repeat(NOME_MAX + 1))).toMatch(/passa de/);
    expect(validarNome("Casa")).toBeNull();
    expect(validarNome("x".repeat(NOME_MAX))).toBeNull();
  });
  it("a chave ignora caixa, acento de caixa e espaços repetidos", () => {
    expect(chaveDoNome("  Residencial   Unifamiliar ")).toBe(chaveDoNome("residencial unifamiliar"));
    expect(chaveDoNome("SAÚDE")).toBe(chaveDoNome("saúde"));
  });
});

describe("fasesValidas", () => {
  it("só ids do catálogo ativo, sem repetir", () => {
    expect(fasesValidas(["a", "b", "a", "zzz"], new Set(["a", "b", "c"]))).toEqual(["a", "b"]);
    expect(fasesValidas(["x"], new Set())).toEqual([]);
  });
});

describe("motivoNaoExcluir", () => {
  it("sem uso pode excluir", () => {
    expect(motivoNaoExcluir({ projetos: 0, negociacoes: 0, modelos: 0 })).toBeNull();
  });
  it("lista cada uso e manda desativar", () => {
    const m = motivoNaoExcluir({ projetos: 3, negociacoes: 0, modelos: 1 });
    expect(m).toContain("3 projeto(s)");
    expect(m).toContain("1 modelo(s) de EAP");
    expect(m).not.toContain("negociação");
    expect(m).toMatch(/Desative/);
  });
});

describe("reordenar", () => {
  const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("troca com o vizinho e numera tudo de 0", () => {
    expect(reordenar(lista, "b", "cima")).toEqual([{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }, { id: "c", ordem: 2 }]);
    expect(reordenar(lista, "b", "baixo")).toEqual([{ id: "a", ordem: 0 }, { id: "c", ordem: 1 }, { id: "b", ordem: 2 }]);
  });
  it("na ponta ou com id desconhecido não faz nada", () => {
    expect(reordenar(lista, "a", "cima")).toBeNull();
    expect(reordenar(lista, "c", "baixo")).toBeNull();
    expect(reordenar(lista, "x", "baixo")).toBeNull();
  });
});
