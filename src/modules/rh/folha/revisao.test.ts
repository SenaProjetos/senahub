import { describe, expect, it } from "vitest";
import { diffHolerite, lerItensGuardados, liquidoDeItens, montarRevisao, type ItemHolerite } from "./revisao";

const sal: ItemHolerite = { descricao: "Salário base", tipo: "provento", valor: 3000 };
const inss: ItemHolerite = { descricao: "INSS", tipo: "desconto", valor: 300 };

describe("diffHolerite", () => {
  it("sem diferença → lista vazia", () => {
    expect(diffHolerite([sal, inss], [inss, sal])).toEqual([]);
  });

  it("valor diferente → alterado; item novo → adicionado; item sumido → removido", () => {
    const r = diffHolerite(
      [sal, inss],
      [{ ...sal, valor: 3100 }, { descricao: "Hora extra", tipo: "provento", valor: 200 }],
    );
    expect(r).toEqual([
      { kind: "alterado", descricao: "Salário base", tipo: "provento", antes: 3000, depois: 3100 },
      { kind: "removido", descricao: "INSS", tipo: "desconto", antes: 300 },
      { kind: "adicionado", descricao: "Hora extra", tipo: "provento", depois: 200 },
    ]);
  });

  it("mesma descrição com tipo diferente não casa", () => {
    const r = diffHolerite(
      [{ descricao: "Ajuste", tipo: "provento", valor: 50 }],
      [{ descricao: "Ajuste", tipo: "desconto", valor: 50 }],
    );
    expect(r.map((m) => m.kind)).toEqual(["removido", "adicionado"]);
  });

  it("descrições repetidas casam uma a uma, na ordem", () => {
    const a = { descricao: "Diferença salarial", tipo: "provento" as const, valor: 10 };
    const r = diffHolerite([a, { ...a, valor: 20 }], [a, { ...a, valor: 25 }]);
    expect(r).toEqual([{ kind: "alterado", descricao: "Diferença salarial", tipo: "provento", antes: 20, depois: 25 }]);
  });

  it("compara em centavos (sem erro de ponto flutuante)", () => {
    expect(diffHolerite([{ ...sal, valor: 0.1 + 0.2 }], [{ ...sal, valor: 0.3 }])).toEqual([]);
  });
});

describe("liquidoDeItens", () => {
  it("proventos − descontos", () => {
    expect(liquidoDeItens([sal, inss])).toBe(2700);
  });
});

describe("lerItensGuardados", () => {
  it("aceita o formato guardado", () => {
    expect(lerItensGuardados([sal])).toEqual([sal]);
  });
  it("rejeita lixo", () => {
    expect(lerItensGuardados(null)).toBeNull();
    expect(lerItensGuardados([{ descricao: "x", tipo: "outro", valor: 1 }])).toBeNull();
    expect(lerItensGuardados([{ descricao: "x", tipo: "provento", valor: "1" }])).toBeNull();
  });
});

describe("montarRevisao", () => {
  it("sem assinatura revogada → null", () => {
    expect(montarRevisao(null, [sal], [sal])).toBeNull();
  });

  it("com snapshot: lista mudanças e os dois líquidos", () => {
    const r = montarRevisao(new Date("2026-10-01T12:00:00Z"), [sal, inss], [{ ...sal, valor: 3100 }, inss]);
    expect(r?.semDetalhe).toBe(false);
    expect(r?.mudancas).toHaveLength(1);
    expect(r?.liquidoAntes).toBe(2700);
    expect(r?.liquidoDepois).toBe(2800);
    expect(r?.assinadoAnteriorEm).toBe("2026-10-01T12:00:00.000Z");
  });

  it("sem snapshot legível: marca semDetalhe e não inventa mudança", () => {
    const r = montarRevisao(new Date("2026-10-01T12:00:00Z"), null, [sal, inss]);
    expect(r?.semDetalhe).toBe(true);
    expect(r?.mudancas).toEqual([]);
  });
});
