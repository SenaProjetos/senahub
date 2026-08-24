import { describe, expect, it } from "vitest";
import { gruposRevisaoAgrupada } from "./revisao-agrupada";

describe("gruposRevisaoAgrupada", () => {
  it("reúne PDF e DWG com mesmo nome-base no mesmo destino", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null },
      { nome: "planta.dwg", pacote: "A", pastaId: null },
    ])).toEqual([{ chave: "A/planta", indices: [0, 1] }]);
  });

  it("não agrupa arquivos de destinos diferentes", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null },
      { nome: "planta.dwg", pacote: "B", pastaId: null },
    ])).toEqual([]);
  });

  it("não junta um formato realocado para Outros ao arquivo que ficou em Pranchas", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null },
      { nome: "planta.xyz", pacote: "A", pastaId: null },
    ])).toEqual([]);
  });

  it("mantém duas cópias da mesma extensão no fluxo normal", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null },
      { nome: "planta.pdf", pacote: "A", pastaId: null },
    ])).toEqual([]);
  });
});
