import { describe, it, expect } from "vitest";
import { montarHeatmap, type EventoUso } from "./heatmap";

const hoje = new Date(2026, 5, 27); // 27/06/2026 (mês 0-based: 5 = junho)

function ev(modulo: string, ano: number, mes: number, dia: number): EventoUso {
  return { modulo, em: new Date(ano, mes, dia) };
}

describe("montarHeatmap", () => {
  it("monta janela de N dias do mais antigo ao mais recente", () => {
    const r = montarHeatmap([], { dias: 3, hoje });
    expect(r.dias).toEqual(["2026-06-25", "2026-06-26", "2026-06-27"]);
    expect(r.modulos).toEqual([]);
    expect(r.max).toBe(0);
    expect(r.totalGeral).toBe(0);
  });

  it("conta por módulo e dia e ordena por total desc", () => {
    const eventos = [
      ev("projetos", 2026, 5, 27),
      ev("projetos", 2026, 5, 27),
      ev("projetos", 2026, 5, 26),
      ev("financeiro", 2026, 5, 25),
    ];
    const r = montarHeatmap(eventos, { dias: 3, hoje });
    expect(r.modulos).toEqual([
      { modulo: "projetos", total: 3 },
      { modulo: "financeiro", total: 1 },
    ]);
    expect(r.matriz[0]).toEqual([0, 1, 2]); // projetos: 25,26,27
    expect(r.matriz[1]).toEqual([1, 0, 0]); // financeiro
    expect(r.max).toBe(2);
    expect(r.totalGeral).toBe(4);
  });

  it("ignora eventos fora da janela", () => {
    const eventos = [ev("projetos", 2026, 5, 1), ev("projetos", 2026, 5, 27)];
    const r = montarHeatmap(eventos, { dias: 3, hoje });
    expect(r.modulos).toEqual([{ modulo: "projetos", total: 1 }]);
    expect(r.matriz[0]).toEqual([0, 0, 1]);
  });

  it("limita a topN módulos (desempate alfabético)", () => {
    const eventos = [
      ev("a", 2026, 5, 27),
      ev("a", 2026, 5, 27),
      ev("b", 2026, 5, 27),
      ev("c", 2026, 5, 27),
    ];
    const r = montarHeatmap(eventos, { dias: 1, hoje, topN: 2 });
    expect(r.modulos.map((m) => m.modulo)).toEqual(["a", "b"]);
  });
});
