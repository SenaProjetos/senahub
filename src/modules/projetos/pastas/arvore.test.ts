import { describe, expect, it } from "vitest";
import { listarComProfundidade, montarArvorePastas, type PastaFlat } from "./arvore";

const pastas: PastaFlat[] = [
  { id: "raiz", parentId: null, nome: "Aprovação", caminho: "aprovacao", origem: "template", ordem: 0 },
  { id: "laudos", parentId: "raiz", nome: "Laudos", caminho: "aprovacao/laudos", origem: "template", ordem: 0 },
  { id: "projetos", parentId: "raiz", nome: "Projetos", caminho: "aprovacao/projetos", origem: "template", ordem: 1 },
  { id: "extra", parentId: null, nome: "Fotos do site", caminho: "fotos-do-site", origem: "custom", ordem: 1 },
];

describe("montarArvorePastas", () => {
  it("aninha por parentId respeitando ordem, e anexa arquivos por pastaId", () => {
    const arquivos = new Map([["laudos", [{ id: "u1" }]]]);
    const arvore = montarArvorePastas(pastas, arquivos);
    expect(arvore.map((n) => n.id)).toEqual(["raiz", "extra"]);
    expect(arvore[0].filhos.map((n) => n.id)).toEqual(["laudos", "projetos"]);
    expect(arvore[0].filhos[0].arquivos).toEqual([{ id: "u1" }]);
    expect(arvore[0].arquivos).toEqual([]);
    expect(arvore[1].filhos).toEqual([]);
  });

  it("pasta sem arquivos recebe lista vazia", () => {
    const arvore = montarArvorePastas(pastas, new Map());
    expect(arvore[0].filhos[1].arquivos).toEqual([]);
  });
});

describe("listarComProfundidade", () => {
  it("achata com profundidade crescente por nível", () => {
    const arvore = montarArvorePastas(pastas, new Map());
    const flat = listarComProfundidade(arvore);
    expect(flat).toEqual([
      { id: "raiz", nome: "Aprovação", profundidade: 0 },
      { id: "laudos", nome: "Laudos", profundidade: 1 },
      { id: "projetos", nome: "Projetos", profundidade: 1 },
      { id: "extra", nome: "Fotos do site", profundidade: 0 },
    ]);
  });
});
