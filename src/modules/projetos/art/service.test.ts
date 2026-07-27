import { describe, it, expect } from "vitest";
import { proximoNumeroVersao, podeReceberNovaVersao, rotuloArt, LABEL_SITUACAO_ART } from "./service";

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
});
