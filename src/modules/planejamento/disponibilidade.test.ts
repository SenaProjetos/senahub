import { describe, expect, it } from "vitest";
import {
  capacidadeEfetivaPctNoDia,
  chaveSemanaIso,
  diaEstaNaFaixa,
  minutosDisponiveisNoDia,
  percentualAlocadoNoDia,
  superalocadoNaJanela,
} from "./disponibilidade";

describe("disponibilidade", () => {
  it("trata os limites da faixa como inclusivos", () => {
    const faixa = { inicio: "2026-08-10", fim: "2026-08-12" };
    expect(diaEstaNaFaixa("2026-08-10", faixa)).toBe(true);
    expect(diaEstaNaFaixa("2026-08-12", faixa)).toBe(true);
    expect(diaEstaNaFaixa("2026-08-13", faixa)).toBe(false);
  });

  it("zera a jornada quando há indisponibilidade aprovada", () => {
    expect(minutosDisponiveisNoDia(480, 0.8, false)).toBe(384);
    expect(minutosDisponiveisNoDia(480, 0.8, true)).toBe(0);
  });

  it("soma somente as alocações vigentes no dia", () => {
    const alocacoes = [
      { inicio: "2026-08-01", fim: "2026-08-15", percentual: 60 },
      { inicio: "2026-08-10", fim: null, percentual: 30 },
    ];
    expect(percentualAlocadoNoDia("2026-08-09", alocacoes)).toBe(60);
    expect(percentualAlocadoNoDia("2026-08-10", alocacoes)).toBe(90);
  });

  it("considera ausência futura ao detectar superalocação", () => {
    const alocacoes = [{ inicio: "2026-08-10", fim: "2026-08-14", percentual: 80 }];
    const ferias = [{ inicio: "2026-08-12", fim: "2026-08-12" }];
    expect(capacidadeEfetivaPctNoDia("2026-08-12", 100, ferias)).toBe(0);
    expect(superalocadoNaJanela("2026-08-10", "2026-08-14", 100, alocacoes, ferias)).toBe(true);
  });

  it("mantém a semana ISO correta na virada do ano", () => {
    expect(chaveSemanaIso("2026-01-01")).toBe("2026-W01");
    expect(chaveSemanaIso("2027-01-01")).toBe("2026-W53");
  });
});
