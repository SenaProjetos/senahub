import { describe, expect, it } from "vitest";
import { montarEscala, PX_POR_DIA, type CalendarioGantt } from "./gantt-escala";

const cal: CalendarioGantt = { diasUteis: [1, 2, 3, 4, 5], feriados: [] };

describe("montarEscala — zoom dias", () => {
  const e = montarEscala({ min: "2026-09-23", max: "2026-10-09", zoom: "dias", calendario: cal });

  it("começa numa segunda-feira, uma semana antes, e termina num domingo", () => {
    expect(e.inicio).toBe("2026-09-14");
    expect(e.x("2026-09-14")).toBe(0);
    expect(new Date(`${e.fim}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(e.fim >= "2026-10-09").toBe(true);
  });

  it("largura = dias × px, e o cabeçalho de cima tem uma faixa por semana", () => {
    const dias = e.base.length;
    expect(e.largura).toBe(dias * PX_POR_DIA.dias);
    expect(e.topo).toHaveLength(dias / 7);
    expect(e.topo.reduce((s, f) => s + f.largura, 0)).toBe(e.largura);
    expect(e.topo[0].rotulo).toBe("14 set 26");
  });

  it("cabeçalho de baixo: uma inicial por dia (segunda = S, domingo = D)", () => {
    expect(e.base[0].rotulo).toBe("S");
    expect(e.base[6].rotulo).toBe("D");
    expect(e.base.slice(0, 7).map((f) => f.rotulo).join("")).toBe("STQQSSD");
  });

  it("x e xFim: o término inclui o dia final", () => {
    expect(e.x("2026-09-21")).toBe(7 * PX_POR_DIA.dias);
    expect(e.xFim("2026-09-21")).toBe(8 * PX_POR_DIA.dias);
    expect(e.contem("2026-09-20")).toBe(true);
    expect(e.contem("2020-01-01")).toBe(false);
  });

  it("fim de semana vira uma faixa de dois dias", () => {
    const sabado = e.x("2026-09-19");
    const faixa = e.naoUteis.find((f) => f.x === sabado);
    expect(faixa?.largura).toBe(2 * PX_POR_DIA.dias);
  });

  it("feriado na sexta cola no fim de semana e vira UMA faixa de três dias", () => {
    const comFeriado = montarEscala({
      min: "2026-09-23",
      max: "2026-10-09",
      zoom: "dias",
      calendario: { diasUteis: [1, 2, 3, 4, 5], feriados: ["2026-09-18"] },
    });
    const sexta = comFeriado.x("2026-09-18");
    const faixa = comFeriado.naoUteis.find((f) => f.x === sexta);
    expect(faixa?.largura).toBe(3 * PX_POR_DIA.dias);
  });

  it("calendário com sábado útil não sombreia o sábado", () => {
    const sabUtil = montarEscala({ min: "2026-09-23", max: "2026-10-09", zoom: "dias", calendario: { diasUteis: [1, 2, 3, 4, 5, 6], feriados: [] } });
    const domingo = sabUtil.x("2026-09-20");
    expect(sabUtil.naoUteis.find((f) => f.x === domingo)?.largura).toBe(PX_POR_DIA.dias);
    expect(sabUtil.naoUteis.some((f) => f.x === sabUtil.x("2026-09-19"))).toBe(false);
  });
});

describe("montarEscala — zoom semanas", () => {
  const e = montarEscala({ min: "2026-09-23", max: "2026-12-10", zoom: "semanas", calendario: cal });

  it("cabeçalho de cima por mês, de baixo por semana (dia da segunda), cobrindo a mesma largura", () => {
    expect(e.topo.reduce((s, f) => s + f.largura, 0)).toBe(e.largura);
    expect(e.base.reduce((s, f) => s + f.largura, 0)).toBe(e.largura);
    expect(e.topo.map((f) => f.rotulo)).toContain("out 26");
    expect(e.base[0].rotulo).toBe(e.inicio.slice(8, 10));
  });

  it("os meses do cabeçalho de cima são contíguos", () => {
    for (let i = 1; i < e.topo.length; i++) expect(e.topo[i].x).toBeCloseTo(e.topo[i - 1].x + e.topo[i - 1].largura, 6);
  });
});

describe("montarEscala — zoom meses", () => {
  const e = montarEscala({ min: "2026-09-23", max: "2027-03-10", zoom: "meses", calendario: cal });

  it("cabeçalho de cima por ano, de baixo por mês, sem sombreado de dia não útil", () => {
    expect(e.topo.map((f) => f.rotulo)).toEqual(["2026", "2027"]);
    expect(e.base[0].rotulo).toBe("ago");
    expect(e.naoUteis).toEqual([]);
    expect(e.topo.reduce((s, f) => s + f.largura, 0)).toBeCloseTo(e.largura, 6);
    expect(e.base.reduce((s, f) => s + f.largura, 0)).toBeCloseTo(e.largura, 6);
  });

  it("começa no dia 1 do mês anterior e termina no fim de um mês", () => {
    expect(e.inicio).toBe("2026-08-01");
    expect(e.fim.slice(8)).toMatch(/^(28|29|30|31)$/);
  });
});
