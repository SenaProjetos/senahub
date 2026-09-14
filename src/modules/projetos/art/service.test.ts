import { describe, it, expect } from "vitest";
import {
  proximoNumeroVersao,
  podeReceberNovaVersao,
  rotuloArt,
  LABEL_SITUACAO_ART,
  lancamentosDaTaxaArt,
} from "./service";

describe("art/service", () => {
  it("primeira versão é 1", () => {
    expect(proximoNumeroVersao([])).toBe(1);
  });

  it("numeração continua do maior existente (não do tamanho da lista)", () => {
    expect(proximoNumeroVersao([{ numero: 1 }, { numero: 2 }])).toBe(3);
    // Buraco no meio (versão apagada) não faz o número regredir.
    expect(proximoNumeroVersao([{ numero: 1 }, { numero: 5 }])).toBe(6);
  });

  it("ART cancelada ou baixada não recebe nova versão", () => {
    expect(podeReceberNovaVersao("registrada")).toBe(true);
    expect(podeReceberNovaVersao("rascunho")).toBe(true);
    expect(podeReceberNovaVersao("substituida")).toBe(true);
    expect(podeReceberNovaVersao("cancelada")).toBe(false);
    expect(podeReceberNovaVersao("baixada")).toBe(false);
  });

  it("rótulo curto do documento", () => {
    expect(rotuloArt({ tipo: "ART", numero: "123456" })).toBe("ART 123456");
    expect(rotuloArt({ tipo: "RRT", numero: "A-99" })).toBe("RRT A-99");
  });

  it("mapa de rótulos cobre todas as situações", () => {
    expect(LABEL_SITUACAO_ART.registrada).toBe("Registrada");
    expect(LABEL_SITUACAO_ART.substituida).toBe("Substituída");
  });

  describe("lancamentosDaTaxaArt", () => {
    const taxa = (situacao: string, custeio: string, valor: number | null = 250) =>
      lancamentosDaTaxaArt({ situacao, custeio, valor });

    it("empresa paga → só despesa", () => {
      expect(taxa("registrada", "empresa")).toEqual({ despesa: true, reembolso: false });
    });

    it("reembolso → despesa e receita do reembolso", () => {
      expect(taxa("registrada", "reembolso")).toEqual({ despesa: true, reembolso: true });
    });

    it("cliente paga direto → nenhum lançamento", () => {
      expect(taxa("registrada", "cliente")).toEqual({ despesa: false, reembolso: false });
    });

    it("rascunho e cancelada não geram taxa; baixada continua gerando", () => {
      expect(taxa("rascunho", "reembolso")).toEqual({ despesa: false, reembolso: false });
      expect(taxa("cancelada", "empresa")).toEqual({ despesa: false, reembolso: false });
      expect(taxa("baixada", "empresa")).toEqual({ despesa: true, reembolso: false });
    });

    it("sem valor ou valor zero → nenhum lançamento", () => {
      expect(taxa("registrada", "empresa", null)).toEqual({ despesa: false, reembolso: false });
      expect(taxa("registrada", "reembolso", 0)).toEqual({ despesa: false, reembolso: false });
    });
  });
});
