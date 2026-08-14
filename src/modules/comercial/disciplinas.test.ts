import { describe, it, expect } from "vitest";
import { disciplinasDeItens } from "./disciplinas";

describe("disciplinasDeItens", () => {
  it("mapeia disciplina→nome e preserva o valor", () => {
    const r = disciplinasDeItens([
      { disciplina: "Estrutural", valor: 15000 },
      { disciplina: "Elétrico", valor: 8000 },
    ]);
    expect(r).toEqual([
      { nome: "Estrutural", valor: 15000, ordem: 0 },
      { nome: "Elétrico", valor: 8000, ordem: 1 },
    ]);
  });

  it("renumera a ordem a partir de 0, sem buracos", () => {
    // O chamador busca com orderBy ordem asc; a ordem final vem do índice, não do campo.
    const r = disciplinasDeItens([
      { disciplina: "A", valor: 1 },
      { disciplina: "B", valor: 2 },
      { disciplina: "C", valor: 3 },
    ]);
    expect(r.map((d) => d.ordem)).toEqual([0, 1, 2]);
  });

  it("lista vazia devolve lista vazia (o aceite barra antes, mas a função não quebra)", () => {
    expect(disciplinasDeItens([])).toEqual([]);
  });

  it("não converte o valor — Decimal do Prisma passa intacto", () => {
    // Converter para number aqui perderia precisão de valor monetário.
    const decimalFalso = { toString: () => "1234.56" };
    const r = disciplinasDeItens([{ disciplina: "Hidrossanitário", valor: decimalFalso }]);
    expect(r[0].valor).toBe(decimalFalso);
  });

  it("preserva disciplinas repetidas como entradas distintas", () => {
    const r = disciplinasDeItens([
      { disciplina: "Elétrico", valor: 100 },
      { disciplina: "Elétrico", valor: 200 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].ordem).toBe(0);
    expect(r[1].ordem).toBe(1);
  });
});
