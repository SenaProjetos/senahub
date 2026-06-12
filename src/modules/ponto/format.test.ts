import { describe, it, expect } from "vitest";
import { minutosSessao, fmtHoras } from "@/modules/ponto/format";

describe("ponto — cálculo de horas", () => {
  it("minutosSessao calcula diferença em minutos", () => {
    const ini = new Date("2026-06-12T08:00:00");
    const fim = new Date("2026-06-12T12:30:00");
    expect(minutosSessao(ini, fim)).toBe(270);
  });

  it("minutosSessao usa 'agora' quando fim é null (sessão aberta)", () => {
    const ini = new Date(Date.now() - 60 * 60000); // 1h atrás
    expect(minutosSessao(ini, null)).toBeGreaterThanOrEqual(59);
    expect(minutosSessao(ini, null)).toBeLessThanOrEqual(61);
  });

  it("minutosSessao nunca retorna negativo", () => {
    const ini = new Date("2026-06-12T12:00:00");
    const fim = new Date("2026-06-12T08:00:00");
    expect(minutosSessao(ini, fim)).toBe(0);
  });

  it("fmtHoras formata horas e minutos", () => {
    expect(fmtHoras(270)).toBe("4h30");
    expect(fmtHoras(60)).toBe("1h00");
    expect(fmtHoras(5)).toBe("0h05");
  });

  it("fmtHoras mostra saldo negativo (banco de horas)", () => {
    expect(fmtHoras(-90)).toBe("-1h30");
  });
});
