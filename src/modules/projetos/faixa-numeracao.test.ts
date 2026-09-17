import { describe, expect, it } from "vitest";
import { faixaConflitante, faixasSeCruzam, type FaixaDisciplina } from "./faixa-numeracao";

const faixa = (nome: string, numeracao: number | null, numeracaoFim: number | null): FaixaDisciplina => ({
  nome,
  numeracao,
  numeracaoFim,
});

// Catálogo real da SENA (2026-09-17): blocos separados de 100 em 100.
const CATALOGO: FaixaDisciplina[] = [
  faixa("Terraplenagem", 1000, 1099),
  faixa("Arquitetura", 3000, 3099),
  faixa("Acústica", 3100, 3199),
  faixa("Estrutural", 4000, 4099),
  faixa("Fundações", 4500, 4599),
  faixa("Elétrico", 5000, 5099),
];

describe("faixasSeCruzam", () => {
  it("blocos vizinhos que só se encostam não se cruzam", () => {
    expect(faixasSeCruzam(faixa("A", 3000, 3099), faixa("B", 3100, 3199))).toBe(false);
  });

  it("compartilhar um único número já é cruzamento", () => {
    expect(faixasSeCruzam(faixa("A", 3000, 3100), faixa("B", 3100, 3199))).toBe(true);
  });

  it("faixa inteiramente dentro de outra cruza (caso Estrutural 4000-4999 x Fundações 4500-4599)", () => {
    expect(faixasSeCruzam(faixa("Estrutural", 4000, 4999), faixa("Fundações", 4500, 4599))).toBe(true);
    expect(faixasSeCruzam(faixa("Fundações", 4500, 4599), faixa("Estrutural", 4000, 4999))).toBe(true);
  });

  it("cruzamento parcial conta", () => {
    expect(faixasSeCruzam(faixa("A", 4000, 4599), faixa("B", 4500, 4999))).toBe(true);
  });

  it("faixa sem o fim não disputa número com ninguém (não entra no reconhecimento)", () => {
    expect(faixasSeCruzam(faixa("A", 4000, null), faixa("B", 4000, 4099))).toBe(false);
    expect(faixasSeCruzam(faixa("A", null, null), faixa("B", 4000, 4099))).toBe(false);
  });

  it("faixa invertida (fim < início) é ignorada aqui — quem barra é a validação de ordem", () => {
    expect(faixasSeCruzam(faixa("A", 4999, 4000), faixa("B", 4500, 4599))).toBe(false);
  });
});

describe("faixaConflitante", () => {
  it("aceita bloco livre entre os já cadastrados", () => {
    expect(faixaConflitante({ numeracao: 6000, numeracaoFim: 6099 }, CATALOGO)).toBeNull();
  });

  it("aponta a disciplina que já ocupa o intervalo", () => {
    expect(faixaConflitante({ numeracao: 4050, numeracaoFim: 4150 }, CATALOGO)?.nome).toBe("Estrutural");
  });

  it("pega o caso que motivou a regra: alargar Estrutural engoliria Fundações", () => {
    const semEstrutural = CATALOGO.filter((f) => f.nome !== "Estrutural"); // editando a própria linha
    expect(faixaConflitante({ numeracao: 4000, numeracaoFim: 4999 }, semEstrutural)?.nome).toBe("Fundações");
  });

  it("faixa em branco nunca conflita", () => {
    expect(faixaConflitante({ numeracao: null, numeracaoFim: null }, CATALOGO)).toBeNull();
    expect(faixaConflitante({ numeracao: 4000, numeracaoFim: null }, CATALOGO)).toBeNull();
  });
});
