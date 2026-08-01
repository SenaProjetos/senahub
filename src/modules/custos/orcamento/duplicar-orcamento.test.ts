import { describe, expect, it } from "vitest";
import { duplicarItens, type ItemParaDuplicar } from "./duplicar-orcamento";

const base = {
  tipo: "servico" as const,
  ordem: 1,
  descricao: "Item",
  unidade: "M2",
  quantidade: 2,
  custoUnitario: 100,
  bdiPercentual: null,
  bloqueado: false,
  totalSemBdi: 200,
  totalComBdi: 240,
  composicaoId: null,
  insumoId: null,
  basePrecoUsadaId: null,
};

/** G1 > SG1 > {S1, S2} — 3 níveis, o caso onde o remapeamento costuma falhar. */
const ARVORE: ItemParaDuplicar[] = [
  { ...base, id: "G1", parentId: null, tipo: "grupo", codigo: "1", descricao: "Grupo 1" },
  { ...base, id: "SG1", parentId: "G1", tipo: "grupo", codigo: "1.1", descricao: "Subgrupo" },
  { ...base, id: "S1", parentId: "SG1", codigo: "1.1.1", descricao: "Serviço 1" },
  { ...base, id: "S2", parentId: "SG1", codigo: "1.1.2", descricao: "Serviço 2", ordem: 2 },
];

const gerarId = (i: number) => `novo-${i}`;

describe("duplicarItens", () => {
  it("nenhum parentId do original sobrevive na cópia", () => {
    const r = duplicarItens(ARVORE, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const idsOriginais = new Set(ARVORE.map((i) => i.id));
    for (const item of r.itens) {
      expect(idsOriginais.has(item.id)).toBe(false);
      if (item.parentId !== null) expect(idsOriginais.has(item.parentId)).toBe(false);
    }
  });

  it("preserva a hierarquia (mesma forma, ids novos)", () => {
    const r = duplicarItens(ARVORE, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porCodigo = new Map(r.itens.map((i) => [i.codigo, i]));
    const g1 = porCodigo.get("1")!;
    const sg1 = porCodigo.get("1.1")!;
    const s1 = porCodigo.get("1.1.1")!;
    expect(g1.parentId).toBeNull();
    expect(sg1.parentId).toBe(g1.id);
    expect(s1.parentId).toBe(sg1.id);
  });

  it("todos os itens apontam para o orçamento novo", () => {
    const r = duplicarItens(ARVORE, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.every((i) => i.orcamentoId === "orc-novo")).toBe(true);
  });

  it("preserva WBS, ordem, valores materializados e vínculos", () => {
    const comVinculo: ItemParaDuplicar[] = [
      { ...base, id: "S", parentId: null, codigo: "1", composicaoId: "comp-1", basePrecoUsadaId: "base-1", bloqueado: true, bdiPercentual: 12.5 },
    ];
    const r = duplicarItens(comVinculo, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0]).toMatchObject({
      codigo: "1",
      ordem: 1,
      quantidade: 2,
      custoUnitario: 100,
      totalSemBdi: 200,
      totalComBdi: 240,
      composicaoId: "comp-1",
      basePrecoUsadaId: "base-1",
      bloqueado: true,
      bdiPercentual: 12.5,
    });
  });

  it("item vinculado a insumo direto preserva insumoId (não vira manual por acidente)", () => {
    const comInsumo: ItemParaDuplicar[] = [
      { ...base, id: "S", parentId: null, codigo: "1", insumoId: "ins-1", basePrecoUsadaId: "base-1" },
    ];
    const r = duplicarItens(comInsumo, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0]).toMatchObject({ insumoId: "ins-1", composicaoId: null, basePrecoUsadaId: "base-1" });
  });

  it("mapaIds cobre todos os itens", () => {
    const r = duplicarItens(ARVORE, "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mapaIds.size).toBe(ARVORE.length);
  });

  it("árvore órfã é rejeitada em vez de virar cópia quebrada", () => {
    const orfa: ItemParaDuplicar[] = [{ ...base, id: "S", parentId: "nao-existe", codigo: "1" }];
    const r = duplicarItens(orfa, "orc-novo", gerarId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/pai inexistente/i);
  });

  it("orçamento vazio duplica para lista vazia", () => {
    const r = duplicarItens([], "orc-novo", gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens).toEqual([]);
  });
});
