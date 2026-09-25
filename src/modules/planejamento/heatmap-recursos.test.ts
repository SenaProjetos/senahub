import { describe, expect, it } from "vitest";
import { percentualCalculadoPorSemana, percentualDaCapacidade, picoDoMes } from "./heatmap-recursos";

describe("percentualDaCapacidade", () => {
  it("jornada cheia: horas sobre a semana útil", () => {
    expect(percentualDaCapacidade(20, 40)).toBe(50);
    expect(percentualDaCapacidade(60, 40)).toBe(150);
  });

  it("meio período: 100 é a capacidade DELA, não a jornada cheia da empresa", () => {
    // Semana útil de 20 h (40 h × 0,5). 20 h nela enchem a pessoa: 100, e 10 h são "50% dela".
    expect(percentualDaCapacidade(20, 20)).toBe(100);
    expect(percentualDaCapacidade(10, 20)).toBe(50);
    expect(percentualDaCapacidade(30, 20)).toBe(150);
  });

  it("sem semana útil não há base: nulo, nunca zero", () => {
    expect(percentualDaCapacidade(10, 0)).toBeNull();
  });
});

describe("percentualCalculadoPorSemana", () => {
  const pessoa = {
    semanaUtil: { "2026-W40": 40, "2026-W41": 32, "2026-W42": 0 },
    porProjeto: {
      A: { "2026-W40": 20, "2026-W41": 16 },
      B: { "2026-W40": 10 },
      "digitada-do-projeto-sem-cronograma": { "2026-W40": 40 },
    },
  };

  it("soma só as horas dos projetos com cronograma aprovado, sobre a semana útil", () => {
    const r = percentualCalculadoPorSemana(pessoa, ["A", "B"]);
    expect(r.get("2026-W40")).toBe(75);
    expect(r.get("2026-W41")).toBe(50);
  });

  it("projeto que não é calculado (alocação digitada convertida) não entra", () => {
    const r = percentualCalculadoPorSemana(pessoa, ["A"]);
    expect(r.get("2026-W40")).toBe(50);
  });

  it("semana sem horas ou sem semana útil não gera entrada", () => {
    const r = percentualCalculadoPorSemana(pessoa, ["A", "B"]);
    expect(r.has("2026-W42")).toBe(false);
    expect(percentualCalculadoPorSemana(pessoa, []).size).toBe(0);
  });

  it("passa de 100% quando as horas superam a semana útil", () => {
    const r = percentualCalculadoPorSemana({ semanaUtil: { "2026-W40": 40 }, porProjeto: { A: { "2026-W40": 60 } } }, ["A"]);
    expect(r.get("2026-W40")).toBe(150);
  });

  it("meio período: 20 h numa semana útil de 20 h dá 100 — a pessoa está cheia, não pela metade", () => {
    const meio = { semanaUtil: { "2026-W40": 20 }, porProjeto: { A: { "2026-W40": 20 } } };
    const r = percentualCalculadoPorSemana(meio, ["A"]);
    expect(r.get("2026-W40")).toBe(100);
    // …e 30 h passam da capacidade (150 contra 100).
    const passou = percentualCalculadoPorSemana({ ...meio, porProjeto: { A: { "2026-W40": 30 } } }, ["A"]);
    expect(passou.get("2026-W40")).toBe(150);
  });
});

describe("picoDoMes", () => {
  // 2026-09-28 é segunda (semana 40); 2026-10-05 é segunda (semana 41).
  const dias = ["2026-09-28", "2026-09-29", "2026-10-05"];
  const calculada = new Map([["2026-W40", 60], ["2026-W41", 90]]);

  it("soma a digitada do dia com a calculada da semana, e devolve as duas parcelas do pior dia", () => {
    const digitada = (dia: string) => (dia === "2026-09-29" ? 40 : 0);
    expect(picoDoMes(dias, digitada, calculada)).toEqual({ total: 100, digitada: 40, calculada: 60 });
  });

  it("sem digitada, vale a maior semana calculada do mês", () => {
    expect(picoDoMes(dias, () => 0, calculada)).toEqual({ total: 90, digitada: 0, calculada: 90 });
  });

  it("sem calculada, é só a digitada (mês fora da janela da carga)", () => {
    expect(picoDoMes(dias, () => 50, new Map())).toEqual({ total: 50, digitada: 50, calculada: 0 });
  });

  it("nada em lugar nenhum: zero", () => {
    expect(picoDoMes(dias, () => 0, new Map())).toEqual({ total: 0, digitada: 0, calculada: 0 });
  });
});
