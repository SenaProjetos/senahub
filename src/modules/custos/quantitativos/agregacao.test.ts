import { describe, it, expect } from "vitest";
import { agregarPorCategoria, agregarPorPavimento } from "./agregacao";
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";

const elementos: ElementoIndex[] = [
  { localId: 1, category: "IFCSLAB", pavimentoLocalId: 10, pavimentoNome: "Pavimento 1" },
  { localId: 2, category: "IFCSLAB", pavimentoLocalId: 10, pavimentoNome: "Pavimento 1" },
  { localId: 3, category: "IFCCOLUMN", pavimentoLocalId: 10, pavimentoNome: "Pavimento 1" },
  { localId: 4, category: "IFCCOLUMN", pavimentoLocalId: 20, pavimentoNome: "Pavimento 2" },
  { localId: 5, category: "IFCWALL", pavimentoLocalId: null, pavimentoNome: null },
];

const valores = new Map<number, number>([
  [1, 12.5],
  [2, 10.0],
  // 3 sem valor
  [4, 3.2],
  // 5 sem valor
]);

describe("agregarPorCategoria", () => {
  it("soma, conta com/sem quantidade, ordena alfabeticamente por categoria", () => {
    expect(agregarPorCategoria(elementos, valores)).toEqual([
      { chave: "IFCCOLUMN", totalElementos: 2, comQuantidade: 1, semQuantidade: 1, soma: 3.2 },
      { chave: "IFCSLAB", totalElementos: 2, comQuantidade: 2, semQuantidade: 0, soma: 22.5 },
      { chave: "IFCWALL", totalElementos: 1, comQuantidade: 0, semQuantidade: 1, soma: 0 },
    ]);
  });

  it("lista vazia → vazio", () => {
    expect(agregarPorCategoria([], new Map())).toEqual([]);
  });
});

describe("agregarPorPavimento", () => {
  it("agrupa por pavimento, elemento sem pavimento cai em rótulo fixo", () => {
    expect(agregarPorPavimento(elementos, valores)).toEqual(
      expect.arrayContaining([
        { chave: "Pavimento 1", totalElementos: 3, comQuantidade: 2, semQuantidade: 1, soma: 22.5 },
        { chave: "Pavimento 2", totalElementos: 1, comQuantidade: 1, semQuantidade: 0, soma: 3.2 },
        { chave: "(sem pavimento)", totalElementos: 1, comQuantidade: 0, semQuantidade: 1, soma: 0 },
      ]),
    );
    expect(agregarPorPavimento(elementos, valores)).toHaveLength(3);
  });
});
