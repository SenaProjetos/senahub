import { describe, it, expect } from "vitest";
import { podeAbordar, registrarOptOut, WHERE_PODE_ABORDAR } from "./lgpd";

describe("podeAbordar", () => {
  it("recusa quem pediu descadastro", () => {
    expect(podeAbordar({ optOut: true })).toBe(false);
  });

  it("permite quem não pediu descadastro", () => {
    expect(podeAbordar({ optOut: false })).toBe(true);
  });

  it("descadastro vence, mesmo com e-mail e telefone preenchidos", () => {
    expect(podeAbordar({ optOut: true, email: "a@b.com", telefone: "81999999999" })).toBe(false);
  });

  it("contato sem e-mail nem telefone continua abordável — há LinkedIn, telefone da empresa, visita", () => {
    expect(podeAbordar({ optOut: false, email: null, telefone: null })).toBe(true);
  });
});

describe("WHERE_PODE_ABORDAR", () => {
  it("espelha a regra de podeAbordar — as duas precisam mudar juntas", () => {
    expect(WHERE_PODE_ABORDAR).toEqual({ optOut: false });
    // Um contato que casa com o filtro do banco tem de passar na checagem em memória.
    expect(podeAbordar({ optOut: WHERE_PODE_ABORDAR.optOut })).toBe(true);
  });
});

describe("registrarOptOut", () => {
  it("marca o descadastro com o instante do pedido", () => {
    const agora = new Date("2026-08-14T10:30:00Z");
    expect(registrarOptOut(agora)).toEqual({ optOut: true, optOutAt: agora });
  });

  it("o resultado torna o contato não-abordável", () => {
    expect(podeAbordar(registrarOptOut())).toBe(false);
  });
});
