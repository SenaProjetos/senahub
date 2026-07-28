import { describe, expect, it } from "vitest";
import { calcularCustoUnitario, type ItemComposicaoRef } from "./composicao";

function montarResolvers(composicoes: Record<string, ItemComposicaoRef[]>, precos: Record<string, number>) {
  const resolverItens = (id: string) => composicoes[id];
  const resolverPreco = (id: string) => precos[id];
  return { resolverItens, resolverPreco };
}

describe("calcularCustoUnitario", () => {
  it("composição simples: só insumo direto", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      { A: [{ tipo: "insumo", refId: "ins1", coeficiente: 2 }] },
      { ins1: 10 },
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.custoUnitario).toBe(20);
    expect(r.semPreco).toEqual([]);
  });

  it("composição auxiliar 1 nível (espelha o caso real SINAPI 88316: composição referencia composição + insumo)", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      {
        A: [
          { tipo: "composicao", refId: "B", coeficiente: 1 },
          { tipo: "insumo", refId: "ins1", coeficiente: 1 },
        ],
        B: [{ tipo: "insumo", refId: "ins2", coeficiente: 3 }],
      },
      { ins1: 5, ins2: 2 },
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // B = 3*2 = 6; A = 6*1 + 5*1 = 11
    expect(r.custoUnitario).toBe(11);
  });

  it("composição auxiliar em 2 níveis (A→B→C)", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      {
        A: [{ tipo: "composicao", refId: "B", coeficiente: 2 }],
        B: [{ tipo: "composicao", refId: "C", coeficiente: 3 }],
        C: [{ tipo: "insumo", refId: "ins1", coeficiente: 1 }],
      },
      { ins1: 10 },
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // C = 10; B = 10*3 = 30; A = 30*2 = 60
    expect(r.custoUnitario).toBe(60);
  });

  it("ciclo entre composições é rejeitado, sem estourar a pilha", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      {
        A: [{ tipo: "composicao", refId: "B", coeficiente: 1 }],
        B: [{ tipo: "composicao", refId: "A", coeficiente: 1 }],
      },
      {},
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/ciclo/i);
  });

  it("composição que referencia a si mesma é rejeitada", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      { A: [{ tipo: "composicao", refId: "A", coeficiente: 1 }] },
      {},
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/ciclo/i);
  });

  it("profundidade máxima excedida é rejeitada", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      {
        A: [{ tipo: "composicao", refId: "B", coeficiente: 1 }],
        B: [{ tipo: "composicao", refId: "C", coeficiente: 1 }],
        C: [{ tipo: "insumo", refId: "ins1", coeficiente: 1 }],
      },
      { ins1: 10 },
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco, { profundidadeMax: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/profundidade/i);
  });

  it("insumo sem preço não quebra o cálculo — soma 0 e lista em semPreco", () => {
    const { resolverItens, resolverPreco } = montarResolvers(
      {
        A: [
          { tipo: "insumo", refId: "ins1", coeficiente: 2 },
          { tipo: "insumo", refId: "ins-sem-preco", coeficiente: 5 },
        ],
      },
      { ins1: 10 },
    );
    const r = calcularCustoUnitario("A", resolverItens, resolverPreco);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.custoUnitario).toBe(20);
    expect(r.semPreco).toEqual(["ins-sem-preco"]);
  });

  it("composição inexistente é erro, não undefined silencioso", () => {
    const { resolverItens, resolverPreco } = montarResolvers({}, {});
    const r = calcularCustoUnitario("fantasma", resolverItens, resolverPreco);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/não encontrada/i);
  });
});
