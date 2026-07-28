import { describe, expect, it } from "vitest";
import { calcularEncargos, PRESET_ENCARGOS_SINAPI } from "./encargos-obra";

describe("calcularEncargos — preset padrão (valores conferidos à mão)", () => {
  it("não desonerado: grupo A, B, C e D corretos para horista e mensalista", () => {
    const r = calcularEncargos({ regime: "nao_desonerado" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.grupoA).toBe(36.8);
    expect(r.grupoBHorista).toBe(45.65);
    expect(r.grupoBMensalista).toBe(23.94);
    expect(r.grupoC).toBe(12.29);
    expect(r.grupoDHorista).toBe(16.8);
    expect(r.grupoDMensalista).toBe(8.81);
    expect(r.totalHorista).toBe(111.54);
    expect(r.totalMensalista).toBe(81.84);
  });

  it("desonerado: zera a rubrica marcada desoneravel (INSS patronal) e reduz o Grupo D em cascata", () => {
    const r = calcularEncargos({ regime: "desonerado" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.grupoA).toBe(16.8);
    expect(r.grupoDHorista).toBe(7.67);
    expect(r.grupoDMensalista).toBe(4.02);
    expect(r.totalHorista).toBe(82.41);
    expect(r.totalMensalista).toBe(57.05);
  });

  it("desonerado é sempre menor que não desonerado (soma de grupos, não só a rubrica zerada)", () => {
    const deson = calcularEncargos({ regime: "desonerado" });
    const naoDeson = calcularEncargos({ regime: "nao_desonerado" });
    expect(deson.ok && naoDeson.ok).toBe(true);
    if (!deson.ok || !naoDeson.ok) return;
    expect(deson.totalHorista).toBeLessThan(naoDeson.totalHorista);
    expect(deson.totalMensalista).toBeLessThan(naoDeson.totalMensalista);
  });

  it("horista ≠ mensalista quando há rubrica exclusiva de horista (RSR, feriados)", () => {
    const r = calcularEncargos({ regime: "nao_desonerado" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalHorista).not.toBe(r.totalMensalista);
  });

  it("Grupo D nunca é digitado: recalculado sempre a partir de A × B", () => {
    const r = calcularEncargos({ regime: "nao_desonerado" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const esperadoHorista = Math.round(((r.grupoA * r.grupoBHorista) / 100 + Number.EPSILON) * 100) / 100;
    expect(r.grupoDHorista).toBe(esperadoHorista);
  });
});

describe("calcularEncargos — overrides", () => {
  it("override muda só a rubrica indicada e o Grupo D correspondente, mantendo o resto igual", () => {
    const base = calcularEncargos({ regime: "nao_desonerado" });
    const comOverride = calcularEncargos({
      regime: "nao_desonerado",
      overrides: [{ codigo: "A7", horista: 1, mensalista: 1 }], // RAT: 3.0 → 1.0
    });
    expect(base.ok && comOverride.ok).toBe(true);
    if (!base.ok || !comOverride.ok) return;

    expect(comOverride.grupoA).toBe(round2(base.grupoA - 2)); // -2 pontos no grupo A
    expect(comOverride.grupoBHorista).toBe(base.grupoBHorista); // grupo B intocado
    expect(comOverride.grupoC).toBe(base.grupoC); // grupo C intocado
    expect(comOverride.grupoDHorista).not.toBe(base.grupoDHorista); // D reage à mudança de A
  });

  it("rubrica desconhecida no override é rejeitada", () => {
    const r = calcularEncargos({ regime: "nao_desonerado", overrides: [{ codigo: "Z9", horista: 1 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/Z9/);
  });

  it("linhas do demonstrativo refletem override e sinalizam zeragem pelo regime", () => {
    const r = calcularEncargos({ regime: "desonerado", overrides: [{ codigo: "A2", horista: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a1 = r.linhas.find((l) => l.codigo === "A1")!;
    const a2 = r.linhas.find((l) => l.codigo === "A2")!;
    expect(a1.zeradaPeloRegime).toBe(true);
    expect(a1.horista).toBe(0);
    expect(a2.horista).toBe(2);
    expect(a2.zeradaPeloRegime).toBe(false);
  });
});

describe("PRESET_ENCARGOS_SINAPI", () => {
  it("todo código é único", () => {
    const codigos = PRESET_ENCARGOS_SINAPI.map((r) => r.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
