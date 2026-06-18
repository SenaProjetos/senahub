import { describe, it, expect } from "vitest";
import { calcularPlano, type LinhaPlano } from "./recalculo";

const L = (valorPlanejado: number, selecionada = true): LinhaPlano => ({ selecionada, valorPlanejado });

describe("calcularPlano", () => {
  it("debita em ordem e acumula o saldo (exemplo da spec)", () => {
    const r = calcularPlano(100000, [L(20000), L(15000), L(30000)]);
    expect(r.linhas.map((l) => l.saldoAcumulado)).toEqual([80000, 65000, 35000]);
    expect(r.linhas.every((l) => l.contemplada)).toBe(true);
    expect(r.indicadores.totalPlanejado).toBe(65000);
    expect(r.indicadores.saldoRemanescente).toBe(35000);
    expect(r.indicadores.percentualCobertura).toBe(100);
  });

  it("não contempla quando não cabe, mas contempla linha menor seguinte", () => {
    const r = calcularPlano(100, [L(80), L(50), L(20)]);
    // 80 cabe (saldo 20); 50 não cabe (saldo segue 20); 20 cabe (saldo 0)
    expect(r.linhas[0]).toEqual({ saldoAcumulado: 20, contemplada: true });
    expect(r.linhas[1]).toEqual({ saldoAcumulado: 20, contemplada: false });
    expect(r.linhas[2]).toEqual({ saldoAcumulado: 0, contemplada: true });
    expect(r.indicadores.contempladas).toBe(2);
    expect(r.indicadores.naoContempladas).toBe(1);
    expect(r.indicadores.totalContemplado).toBe(100);
    expect(r.indicadores.totalPlanejado).toBe(150);
    expect(r.indicadores.percentualCobertura).toBeCloseTo(66.7);
  });

  it("ignora linhas não selecionadas no consumo", () => {
    const r = calcularPlano(100, [L(40, false), L(30)]);
    expect(r.linhas[0]).toEqual({ saldoAcumulado: 100, contemplada: false });
    expect(r.linhas[1]).toEqual({ saldoAcumulado: 70, contemplada: true });
    expect(r.indicadores.totalPlanejado).toBe(30);
    expect(r.indicadores.contempladas).toBe(1);
  });

  it("cobertura 100% quando nada planejado", () => {
    const r = calcularPlano(100, [L(0, false)]);
    expect(r.indicadores.percentualCobertura).toBe(100);
    expect(r.indicadores.totalPlanejado).toBe(0);
  });
});
