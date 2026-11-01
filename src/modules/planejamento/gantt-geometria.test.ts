import { describe, expect, it } from "vitest";
import { geometriaDasBarras, geometriaDoAgrupamento } from "./gantt-geometria";

describe("geometriaDasBarras", () => {
  it("planejamento: uma barra de 14 px no topo 7, como sempre foi", () => {
    expect(geometriaDasBarras("planejamento", 28)).toEqual({ execTop: 7, execAltura: 14, baseTop: null, baseAltura: null });
  });

  it("controle: duas barras de 9 px, 2 px entre elas", () => {
    expect(geometriaDasBarras("controle", 28)).toEqual({ execTop: 4, execAltura: 9, baseTop: 15, baseAltura: 9 });
  });

  it("controle: cabe na linha, com 2 px entre as barras e folga igual acima e abaixo", () => {
    const g = geometriaDasBarras("controle", 28);
    expect(g.baseTop! + g.baseAltura!).toBeLessThanOrEqual(28);
    expect(g.execTop + g.execAltura + 2).toBe(g.baseTop);
    expect(g.execTop).toBe(28 - (g.baseTop! + g.baseAltura!));
  });
});

describe("geometriaDoAgrupamento", () => {
  it("planejamento: o desenho de hoje (barra em 8, pontas em 14)", () => {
    expect(geometriaDoAgrupamento("planejamento", 28)).toEqual({ barraTop: 8, barraAltura: 6, pontaTop: 14, pontaAltura: 6 });
  });

  it("controle: encaixado na faixa da execução, sem invadir a faixa da base", () => {
    const exec = geometriaDasBarras("controle", 28);
    const g = geometriaDoAgrupamento("controle", 28);
    expect(g.barraTop).toBeGreaterThanOrEqual(exec.execTop);
    expect(g.pontaTop + g.pontaAltura).toBeLessThanOrEqual(exec.execTop + exec.execAltura);
    expect(g.pontaTop + g.pontaAltura).toBeLessThan(exec.baseTop!);
  });
});
