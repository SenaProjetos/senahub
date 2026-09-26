import { describe, expect, it } from "vitest";
import {
  colunasPorPeriodo,
  percentualCalculadoPorSemana,
  percentualDaCapacidade,
  picoDoMes,
  segundaDaSemana,
} from "./heatmap-recursos";

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

describe("colunasPorPeriodo (decisão #4)", () => {
  // 2026-09-25 é sexta; a segunda da semana é 2026-09-21.
  const hoje = "2026-09-25";

  it("a segunda-feira da semana, inclusive de um domingo", () => {
    expect(segundaDaSemana("2026-09-25")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-21")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-27")).toBe("2026-09-21");
  });

  it("1 semana: os 5 dias úteis, um por coluna", () => {
    const c = colunasPorPeriodo("1s", hoje);
    expect(c.map((x) => x.rotulo)).toEqual(["seg 21", "ter 22", "qua 23", "qui 24", "sex 25"]);
    expect(c.every((x) => x.dias.length === 1 && x.dias[0] === x.chave)).toBe(true);
    expect(c[0].titulo).toBe("seg, 21/09");
  });

  it("4 semanas: uma coluna por semana, de segunda a domingo, a partir da semana de hoje", () => {
    const c = colunasPorPeriodo("4s", hoje);
    expect(c).toHaveLength(4);
    expect(c[0].chave).toBe("2026-09-21");
    expect(c[0].dias).toHaveLength(7);
    expect(c[0].dias[6]).toBe("2026-09-27");
    expect(c[1].chave).toBe("2026-09-28");
    expect(c[0].titulo).toBe("semana de 21/09 a 27/09");
    expect(c[3].rotulo).toBe("12/10");
  });

  it("12 semanas: a janela que a carga calculada cobre, atravessando a virada de ano", () => {
    const c = colunasPorPeriodo("12s", "2026-12-15");
    expect(c).toHaveLength(12);
    expect(c[0].chave).toBe("2026-12-14");
    expect(c[3].chave).toBe("2027-01-04");
    expect(c[3].dias[0]).toBe("2027-01-04");
  });

  it("o pico de uma coluna semanal é o pior dia dela", () => {
    const [semana] = colunasPorPeriodo("4s", hoje);
    const digitada = (dia: string) => (dia === "2026-09-23" ? 70 : 20);
    const calculada = new Map([["2026-W39", 10]]);
    expect(picoDoMes(semana.dias, digitada, calculada)).toEqual({ total: 80, digitada: 70, calculada: 10 });
  });
});
