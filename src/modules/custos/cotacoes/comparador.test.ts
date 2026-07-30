import { describe, it, expect } from "vitest";
import { compararPropostas, melhorPropostaCompleta, type PropostaEntrada } from "./comparador";

const RFQ_ITENS = ["item-1", "item-2"];

function proposta(overrides: Partial<PropostaEntrada>): PropostaEntrada {
  return {
    propostaId: "p",
    fornecedorNome: "Fornecedor",
    itens: [
      { rfqItemId: "item-1", precoUnitario: 10, quantidadeItem: 5 },
      { rfqItemId: "item-2", precoUnitario: 20, quantidadeItem: 2 },
    ],
    frete: 0,
    impostosInclusos: true,
    impostosValor: null,
    prazoEntregaDias: null,
    validadeAte: null,
    avaliacaoFornecedor: null,
    ...overrides,
  };
}

describe("compararPropostas", () => {
  it("soma preço unitário × quantidade + frete, ordena crescente", () => {
    const a = proposta({ propostaId: "a", frete: 0 }); // 10*5 + 20*2 = 90
    const b = proposta({ propostaId: "b", frete: 5, itens: [
      { rfqItemId: "item-1", precoUnitario: 8, quantidadeItem: 5 },
      { rfqItemId: "item-2", precoUnitario: 20, quantidadeItem: 2 },
    ] }); // 8*5 + 20*2 + 5 = 85
    const resultado = compararPropostas([a, b], RFQ_ITENS);
    expect(resultado.map((p) => p.propostaId)).toEqual(["b", "a"]);
    expect(resultado[0].totalComparavel).toBe(85);
    expect(resultado[1].totalComparavel).toBe(90);
  });

  it("imposto incluso não é somado de novo; não-incluso soma impostosValor", () => {
    const incluso = proposta({ propostaId: "incluso", impostosInclusos: true, impostosValor: 999 });
    const naoIncluso = proposta({ propostaId: "nao-incluso", impostosInclusos: false, impostosValor: 15 });
    const resultado = compararPropostas([incluso, naoIncluso], RFQ_ITENS);
    expect(resultado.find((p) => p.propostaId === "incluso")!.totalComparavel).toBe(90);
    expect(resultado.find((p) => p.propostaId === "nao-incluso")!.totalComparavel).toBe(105);
  });

  it("proposta parcial (item faltando) nunca fica à frente de uma completa, mesmo mais barata", () => {
    const parcialBarata = proposta({
      propostaId: "parcial",
      itens: [{ rfqItemId: "item-1", precoUnitario: 1, quantidadeItem: 1 }], // total = 1, falta item-2
    });
    const completaCara = proposta({ propostaId: "completa" }); // total = 90
    const resultado = compararPropostas([parcialBarata, completaCara], RFQ_ITENS);
    expect(resultado.map((p) => p.propostaId)).toEqual(["completa", "parcial"]);
    expect(resultado.find((p) => p.propostaId === "parcial")!.itensFaltando).toEqual(["item-2"]);
    expect(resultado.find((p) => p.propostaId === "completa")!.itensFaltando).toEqual([]);
  });

  it("empate no total comparável desempata por prazo de entrega menor", () => {
    const lenta = proposta({ propostaId: "lenta", prazoEntregaDias: 30 });
    const rapida = proposta({ propostaId: "rapida", prazoEntregaDias: 5 });
    const resultado = compararPropostas([lenta, rapida], RFQ_ITENS);
    expect(resultado.map((p) => p.propostaId)).toEqual(["rapida", "lenta"]);
  });

  it("empate total e prazo nulo em ambas mantém ordem de chegada", () => {
    const primeira = proposta({ propostaId: "primeira" });
    const segunda = proposta({ propostaId: "segunda" });
    const resultado = compararPropostas([primeira, segunda], RFQ_ITENS);
    expect(resultado.map((p) => p.propostaId)).toEqual(["primeira", "segunda"]);
  });

  it("lista vazia → vazia", () => {
    expect(compararPropostas([], RFQ_ITENS)).toEqual([]);
  });
});

describe("melhorPropostaCompleta", () => {
  it("retorna a primeira completa do ranking", () => {
    const parcial = proposta({
      propostaId: "parcial",
      itens: [{ rfqItemId: "item-1", precoUnitario: 1, quantidadeItem: 1 }],
    });
    const completa = proposta({ propostaId: "completa" });
    const comparadas = compararPropostas([parcial, completa], RFQ_ITENS);
    expect(melhorPropostaCompleta(comparadas)?.propostaId).toBe("completa");
  });

  it("nenhuma completa → null", () => {
    const parcial = proposta({
      propostaId: "parcial",
      itens: [{ rfqItemId: "item-1", precoUnitario: 1, quantidadeItem: 1 }],
    });
    const comparadas = compararPropostas([parcial], RFQ_ITENS);
    expect(melhorPropostaCompleta(comparadas)).toBeNull();
  });
});
