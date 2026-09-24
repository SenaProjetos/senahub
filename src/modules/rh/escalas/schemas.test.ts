import { describe, it, expect } from "vitest";
import { excessoJornadaEstagio, salvarEscalaContratacaoSchema } from "./schemas";

function semana(horasUtil: number, extra?: { diaSemana: number; horasDia: number }) {
  return Array.from({ length: 7 }, (_, diaSemana) => {
    const util = diaSemana >= 1 && diaSemana <= 5;
    const horasDia = extra?.diaSemana === diaSemana ? extra.horasDia : util ? horasUtil : 0;
    return {
      diaSemana,
      ativo: util || extra?.diaSemana === diaSemana,
      entrada: "08:00",
      saida: "14:00",
      descansos: [],
      horasDia,
      toleranciaMin: 10,
    };
  });
}

describe("excessoJornadaEstagio", () => {
  it("aceita a grade legal de 6h × 5 dias (30h)", () => {
    expect(excessoJornadaEstagio(semana(6))).toBeNull();
  });

  it("aceita dia acima de 6h quando a semana compensa (jogo de horas)", () => {
    const dias = semana(6).map((d) =>
      d.diaSemana === 1 ? { ...d, horasDia: 8 } : d.diaSemana === 2 ? { ...d, horasDia: 4 } : d,
    );
    expect(excessoJornadaEstagio(dias)).toBeNull();
  });

  it("recusa semana de 8h × 5 dias (40h)", () => {
    expect(excessoJornadaEstagio(semana(8))).toMatch(/30h por semana.*40h/);
  });

  it("recusa semana acima de 30h mesmo com todo dia dentro do teto", () => {
    expect(excessoJornadaEstagio(semana(6, { diaSemana: 6, horasDia: 4 }))).toMatch(/30h por semana.*34h/);
  });

  it("ignora dia inativo, mesmo com horas preenchidas", () => {
    const dias = semana(6).map((d) => (d.diaSemana === 0 ? { ...d, ativo: false, horasDia: 9 } : d));
    expect(excessoJornadaEstagio(dias)).toBeNull();
  });
});

describe("salvarEscalaContratacaoSchema", () => {
  it("aceita CLT com 8h", () => {
    expect(salvarEscalaContratacaoSchema.safeParse({ contratacao: "clt", dias: semana(8) }).success).toBe(true);
  });

  it("recusa estágio acima do teto legal", () => {
    const r = salvarEscalaContratacaoSchema.safeParse({ contratacao: "estagio", dias: semana(8) });
    expect(r.success).toBe(false);
  });

  it("recusa contratação sem jornada controlada", () => {
    for (const contratacao of ["pj", "autonomo_rpa", "pro_labore"]) {
      expect(salvarEscalaContratacaoSchema.safeParse({ contratacao, dias: semana(8) }).success).toBe(false);
    }
  });

  it("exige os 7 dias", () => {
    expect(salvarEscalaContratacaoSchema.safeParse({ contratacao: "clt", dias: semana(8).slice(0, 5) }).success).toBe(false);
  });
});
