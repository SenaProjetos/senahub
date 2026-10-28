import { describe, expect, it } from "vitest";
import { avisoRecenteNaoVisto, marcaDaVisita } from "./recentes";

const AGORA = new Date("2026-10-28T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

describe("avisoRecenteNaoVisto", () => {
  it("acende com aviso de ontem e sem visita registrada", () => {
    const ontem = new Date(AGORA.getTime() - DIA);
    expect(avisoRecenteNaoVisto(ontem, null, AGORA)).toBe(true);
    expect(avisoRecenteNaoVisto(ontem.toISOString(), null, AGORA)).toBe(true);
  });

  it("apaga quando a última visita é depois do aviso", () => {
    const aviso = new Date(AGORA.getTime() - DIA);
    const visita = AGORA.getTime() - 60 * 60 * 1000;
    expect(avisoRecenteNaoVisto(aviso, visita, AGORA)).toBe(false);
  });

  it("acende quando o aviso é depois da última visita", () => {
    const visita = AGORA.getTime() - 2 * DIA;
    const aviso = new Date(AGORA.getTime() - DIA);
    expect(avisoRecenteNaoVisto(aviso, visita, AGORA)).toBe(true);
  });

  it("borda: aviso de exatamente 3 dias acende, de 3 dias e 1 min não", () => {
    const tres = new Date(AGORA.getTime() - 3 * DIA);
    const tresEUmMin = new Date(AGORA.getTime() - 3 * DIA - 60 * 1000);
    expect(avisoRecenteNaoVisto(tres, null, AGORA)).toBe(true);
    expect(avisoRecenteNaoVisto(tresEUmMin, null, AGORA)).toBe(false);
  });

  it("sem aviso → false", () => {
    expect(avisoRecenteNaoVisto(null, null, AGORA)).toBe(false);
  });

  it("data inválida → false", () => {
    expect(avisoRecenteNaoVisto("não é data", null, AGORA)).toBe(false);
    expect(avisoRecenteNaoVisto(new Date("x"), null, AGORA)).toBe(false);
  });

  it("aviso no futuro distante → false", () => {
    const futuro = new Date(AGORA.getTime() + 2 * DIA);
    expect(avisoRecenteNaoVisto(futuro, null, AGORA)).toBe(false);
  });
});

describe("marcaDaVisita", () => {
  it("relógio certo: grava o agora", () => {
    const aviso = new Date(AGORA.getTime() - DIA).toISOString();
    expect(marcaDaVisita(AGORA.getTime(), aviso)).toBe(AGORA.getTime());
  });
  it("relógio do navegador atrasado: grava o instante do aviso, e o ponto não reacende", () => {
    const aviso = new Date(AGORA.getTime() + 10 * 60 * 1000);
    const atrasado = AGORA.getTime() - 60 * 60 * 1000;
    const marca = marcaDaVisita(atrasado, aviso);
    expect(marca).toBe(aviso.getTime());
    expect(avisoRecenteNaoVisto(aviso, marca, new Date(atrasado))).toBe(false);
  });
  it("sem aviso conhecido ou data inválida: grava o agora", () => {
    expect(marcaDaVisita(AGORA.getTime(), null)).toBe(AGORA.getTime());
    expect(marcaDaVisita(AGORA.getTime(), undefined)).toBe(AGORA.getTime());
    expect(marcaDaVisita(AGORA.getTime(), "x")).toBe(AGORA.getTime());
  });
});
