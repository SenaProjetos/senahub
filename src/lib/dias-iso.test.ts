import { describe, expect, it } from "vitest";
import {
  dataCurta,
  diaDaSemana,
  diasEntre,
  primeiroDiaDoMes,
  segundaDaSemana,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
} from "./dias-iso";

describe("dias-iso", () => {
  it("soma dias atravessando mês, ano e bissexto", () => {
    expect(somarDias("2026-09-25", 7)).toBe("2026-10-02");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("diferença em dias, com sinal", () => {
    expect(diasEntre("2026-09-21", "2026-09-28")).toBe(7);
    expect(diasEntre("2026-09-28", "2026-09-21")).toBe(-7);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasEntre("2026-10-25", "2026-10-25")).toBe(0);
  });

  it("dia da semana e segunda-feira da semana", () => {
    expect(diaDaSemana("2026-09-27")).toBe(0);
    expect(diaDaSemana("2026-09-28")).toBe(1);
    expect(segundaDaSemana("2026-09-25")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-27")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-21")).toBe("2026-09-21");
  });

  it("primeiro e último dia do mês, e soma de meses", () => {
    expect(primeiroDiaDoMes("2026-09-25")).toBe("2026-09-01");
    expect(ultimoDiaDoMes("2026-09-25")).toBe("2026-09-30");
    expect(ultimoDiaDoMes("2028-02-10")).toBe("2028-02-29");
    expect(ultimoDiaDoMes("2026-12-05")).toBe("2026-12-31");
    expect(somarMeses("2026-11-20", 3)).toBe("2027-02-01");
    expect(somarMeses("2026-01-20", -2)).toBe("2025-11-01");
  });

  it("data curta", () => {
    expect(dataCurta("2026-09-05")).toBe("05/09/26");
    expect(dataCurta(null)).toBe("");
    expect(dataCurta("")).toBe("");
  });
});
