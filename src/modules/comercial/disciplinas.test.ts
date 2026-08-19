import { describe, it, expect } from "vitest";
import { disciplinasDeItens, nomeDisciplinaItem } from "./disciplinas";

describe("nomeDisciplinaItem", () => {
  it("prefere o nome do catálogo quando o item já tem FK", () => {
    expect(
      nomeDisciplinaItem({ disciplina: { nome: "Elétrico" }, disciplinaTextoLegado: "Eletrico" }),
    ).toBe("Elétrico");
  });

  it("cai no texto original quando não há FK — item cuja grafia não casou (F1.21 pendente)", () => {
    expect(nomeDisciplinaItem({ disciplina: null, disciplinaTextoLegado: "Lógica/cftv" })).toBe(
      "Lógica/cftv",
    );
  });

  it("cai no texto original quando a relação nem foi incluída na query", () => {
    expect(nomeDisciplinaItem({ disciplinaTextoLegado: "Gases" })).toBe("Gases");
  });

  it("nunca devolve vazio quando há texto legado — a proposta pública não pode mostrar em branco", () => {
    const r = nomeDisciplinaItem({ disciplina: null, disciplinaTextoLegado: "Ar condicionado (ARC)" });
    expect(r.trim()).not.toBe("");
  });
});

describe("disciplinasDeItens", () => {
  it("mapeia disciplina→nome e preserva o valor", () => {
    const r = disciplinasDeItens([
      { disciplinaTextoLegado: "Estrutural", valor: 15000 },
      { disciplinaTextoLegado: "Elétrico", valor: 8000 },
    ]);
    expect(r).toEqual([
      { disciplinaTextoLegado: "Estrutural", valor: 15000, ordem: 0 },
      { disciplinaTextoLegado: "Elétrico", valor: 8000, ordem: 1 },
    ]);
  });

  it("renumera a ordem a partir de 0, sem buracos", () => {
    // O chamador busca com orderBy ordem asc; a ordem final vem do índice, não do campo.
    const r = disciplinasDeItens([
      { disciplinaTextoLegado: "A", valor: 1 },
      { disciplinaTextoLegado: "B", valor: 2 },
      { disciplinaTextoLegado: "C", valor: 3 },
    ]);
    expect(r.map((d) => d.ordem)).toEqual([0, 1, 2]);
  });

  it("lista vazia devolve lista vazia (o aceite barra antes, mas a função não quebra)", () => {
    expect(disciplinasDeItens([])).toEqual([]);
  });

  it("não converte o valor — Decimal do Prisma passa intacto", () => {
    // Converter para number aqui perderia precisão de valor monetário.
    const decimalFalso = { toString: () => "1234.56" };
    const r = disciplinasDeItens([{ disciplinaTextoLegado: "Hidrossanitário", valor: decimalFalso }]);
    expect(r[0].valor).toBe(decimalFalso);
  });

  it("preserva disciplinas repetidas como entradas distintas", () => {
    const r = disciplinasDeItens([
      { disciplinaTextoLegado: "Elétrico", valor: 100 },
      { disciplinaTextoLegado: "Elétrico", valor: 200 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].ordem).toBe(0);
    expect(r[1].ordem).toBe(1);
  });
});
