import { describe, expect, it } from "vitest";
import { MOTIVO_EAP_VAZIA, impedimentoParaApagarEap, type SituacaoParaApagar } from "./apagar-eap";

const rascunho: SituacaoParaApagar = {
  linhas: 184,
  temLinhaDeBase: false,
  cronogramaAprovado: false,
  comAndamento: 0,
  cards: 0,
  parcelasDeContrato: 0,
};

describe("impedimentoParaApagarEap", () => {
  it("rascunho limpo pode apagar", () => {
    expect(impedimentoParaApagarEap(rascunho)).toBeNull();
  });

  it("EAP vazia não tem o que apagar", () => {
    expect(impedimentoParaApagarEap({ ...rascunho, linhas: 0 })).toBe(MOTIVO_EAP_VAZIA);
  });

  it("aprovado ou com linha de base: é o combinado", () => {
    expect(impedimentoParaApagarEap({ ...rascunho, temLinhaDeBase: true })).toMatch(/aprovado/);
    expect(impedimentoParaApagarEap({ ...rascunho, cronogramaAprovado: true })).toMatch(/aprovado/);
  });

  it("andamento, card e parcela de contrato recusam com a contagem", () => {
    expect(impedimentoParaApagarEap({ ...rascunho, comAndamento: 3 })).toMatch(/^3 linha\(s\) já têm andamento/);
    expect(impedimentoParaApagarEap({ ...rascunho, cards: 2 })).toMatch(/^2 card\(s\)/);
    expect(impedimentoParaApagarEap({ ...rascunho, parcelasDeContrato: 1 })).toMatch(/^1 parcela\(s\) do contrato/);
  });

  it("a linha de base vem antes dos outros motivos (é o que decide)", () => {
    expect(impedimentoParaApagarEap({ ...rascunho, temLinhaDeBase: true, cards: 5 })).toMatch(/aprovado/);
  });
});
