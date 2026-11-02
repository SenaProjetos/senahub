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

  it("2027: a primeira semana ISO começa em 2027-01-04 (não W02)", () => {
    expect(chaveSemanaIso("2027-01-03")).toBe("2026-W53");
    expect(chaveSemanaIso("2027-01-04")).toBe("2027-W01");
    expect(chaveSemanaIso("2027-01-10")).toBe("2027-W01");
    expect(chaveSemanaIso("2027-01-11")).toBe("2027-W02");
    expect(chaveSemanaIso("2024-12-30")).toBe("2025-W01");
  });

  it("bate com a definição ISO 8601 em todos os dias de 2020 a 2035", () => {
    // Referência independente: a semana 1 é a que contém 4 de janeiro (ela começa na segunda-feira).
    const segundaDaSemana1 = (ano: number) => {
      const quatro = new Date(Date.UTC(ano, 0, 4));
      return Date.UTC(ano, 0, 4 - ((quatro.getUTCDay() || 7) - 1));
    };
    const referencia = (d: Date) => {
      const t = d.getTime();
      const quinta = new Date(t + (4 - (d.getUTCDay() || 7)) * 86_400_000);
      let ano = quinta.getUTCFullYear();
      if (t < segundaDaSemana1(ano)) ano -= 1;
      else if (ano < 2100 && t >= segundaDaSemana1(ano + 1)) ano += 1;
      const semana = Math.floor((t - segundaDaSemana1(ano)) / (7 * 86_400_000)) + 1;
      return `${ano}-W${String(semana).padStart(2, "0")}`;
    };
    for (let d = new Date(Date.UTC(2020, 0, 1)); d.getUTCFullYear() < 2036; d = new Date(d.getTime() + 86_400_000)) {
      expect(chaveSemanaIso(d.toISOString().slice(0, 10)), d.toISOString().slice(0, 10)).toBe(referencia(d));
    }
  });
});
