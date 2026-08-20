import { describe, expect, it } from "vitest";
import { ehAcaoComercial, TIPO_PROXIMA_ACAO_LABEL } from "./proxima-acao";

describe("ehAcaoComercial", () => {
  it("null e undefined são compromisso de agenda comum, não ação comercial", () => {
    expect(ehAcaoComercial(null)).toBe(false);
    expect(ehAcaoComercial(undefined)).toBe(false);
  });

  it("qualquer tipo preenchido é ação comercial", () => {
    expect(ehAcaoComercial("LIGACAO")).toBe(true);
    expect(ehAcaoComercial("OUTRO")).toBe(true);
  });
});

describe("TIPO_PROXIMA_ACAO_LABEL", () => {
  it("tem rótulo para os 12 tipos do enum (P11 item 3)", () => {
    expect(Object.keys(TIPO_PROXIMA_ACAO_LABEL)).toHaveLength(12);
  });
});
