import { describe, expect, it } from "vitest";
import {
  TEMPERATURAS,
  TEMPERATURA_CLASS,
  TEMPERATURA_ICONE,
  TEMPERATURA_LABEL,
  ehTemperatura,
} from "./temperatura";

describe("ehTemperatura", () => {
  it("aceita os três valores do enum", () => {
    for (const t of TEMPERATURAS) expect(ehTemperatura(t)).toBe(true);
  });

  it("null e undefined não são temperatura — 'não classificado' é estado próprio", () => {
    // Distinto de FRIO de propósito: tratar null como frio faria todo lead novo nascer azul.
    expect(ehTemperatura(null)).toBe(false);
    expect(ehTemperatura(undefined)).toBe(false);
  });

  it("recusa valor fora do enum", () => {
    expect(ehTemperatura("MORNA")).toBe(false);
    expect(ehTemperatura("")).toBe(false);
  });
});

describe("mapas de exibição", () => {
  it("os três têm rótulo, classe e ícone", () => {
    for (const t of TEMPERATURAS) {
      expect(TEMPERATURA_LABEL[t]).toBeTruthy();
      expect(TEMPERATURA_CLASS[t]).toBeTruthy();
      expect(TEMPERATURA_ICONE[t]).toBeTruthy();
    }
  });

  it("usa tokens do design system, nunca cor literal", () => {
    // A regra do projeto: hex/rgb/hsl fora do globals.css quebra o tema escuro.
    for (const t of TEMPERATURAS) {
      expect(TEMPERATURA_CLASS[t]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(TEMPERATURA_CLASS[t]).not.toMatch(/rgb|hsl/i);
    }
  });

  it("cada temperatura tem cor distinta — senão o badge não informa nada", () => {
    const classes = TEMPERATURAS.map((t) => TEMPERATURA_CLASS[t]);
    expect(new Set(classes).size).toBe(TEMPERATURAS.length);
  });
});
