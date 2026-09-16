import { describe, expect, it } from "vitest";
import { gruposRevisaoAgrupada } from "./revisao-agrupada";

describe("gruposRevisaoAgrupada", () => {
  it("reúne PDF e DWG com mesmo nome-base no mesmo destino", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
      { nome: "planta.dwg", pacote: "A", pastaId: null, disciplinaId: "d1" },
    ])).toEqual([{ chave: "d1:A/planta", indices: [0, 1] }]);
  });

  it("não agrupa arquivos de destinos diferentes", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
      { nome: "planta.dwg", pacote: "B", pastaId: null, disciplinaId: "d1" },
    ])).toEqual([]);
  });

  it("não junta um formato realocado para Outros ao arquivo que ficou em Pranchas", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
      { nome: "planta.xyz", pacote: "A", pastaId: null, disciplinaId: "d1" },
    ])).toEqual([]);
  });

  it("mantém duas cópias da mesma extensão no fluxo normal", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
    ])).toEqual([]);
  });

  it("não agrupa o mesmo nome-base quando as disciplinas são diferentes (envio auto-detectado por arquivo)", () => {
    expect(gruposRevisaoAgrupada([
      { nome: "planta.pdf", pacote: "A", pastaId: null, disciplinaId: "d1" },
      { nome: "planta.dwg", pacote: "A", pastaId: null, disciplinaId: "d2" },
    ])).toEqual([]);
  });
});
