import { describe, expect, it } from "vitest";
import {
  addDias,
  agruparPorDia,
  chaveDia,
  diasDaSemana,
  diaDaChave,
  diasDoMes,
  moverParaDia,
  inicioDaSemana,
  navegar,
  tituloDoPeriodo,
} from "./follow-ups-calendario";

// 16/09/2026 é quarta-feira.
const quarta = new Date(2026, 8, 16, 15, 0);

describe("semana", () => {
  it("começa na segunda e termina no domingo", () => {
    const d = diasDaSemana(quarta);
    expect(chaveDia(d[0])).toBe("2026-09-14");
    expect(chaveDia(d[6])).toBe("2026-09-20");
    expect(d).toHaveLength(7);
  });

  it("domingo pertence à semana que termina nele, não à seguinte", () => {
    expect(chaveDia(inicioDaSemana(new Date(2026, 8, 20)))).toBe("2026-09-14");
  });
});

describe("mês", () => {
  it("cobre semanas completas segunda→domingo", () => {
    const g = diasDoMes(quarta);
    expect(g[0].getDay()).toBe(1);
    expect(g[g.length - 1].getDay()).toBe(0);
    expect(g.length % 7).toBe(0);
    expect(g.some((d) => chaveDia(d) === "2026-09-01")).toBe(true);
    expect(g.some((d) => chaveDia(d) === "2026-09-30")).toBe(true);
  });

  it("fevereiro que cabe em 4 semanas não ganha linha extra", () => {
    // 02/2027 começa numa segunda e tem 28 dias.
    expect(diasDoMes(new Date(2027, 1, 10))).toHaveLength(28);
  });
});

describe("navegar", () => {
  it("semana anda 7 dias; mês anda para o dia 1 do mês vizinho", () => {
    expect(chaveDia(navegar(quarta, "semana", 1))).toBe("2026-09-23");
    expect(chaveDia(navegar(quarta, "semana", -1))).toBe("2026-09-09");
    expect(chaveDia(navegar(quarta, "mes", 1))).toBe("2026-10-01");
    expect(chaveDia(navegar(new Date(2026, 0, 31), "mes", 1))).toBe("2026-02-01");
  });
});

describe("agruparPorDia", () => {
  it("usa o dia LOCAL: 23h30 de terça fica em terça", () => {
    const m = agruparPorDia([
      { id: "a", inicio: new Date(2026, 8, 15, 23, 30).toISOString() },
      { id: "b", inicio: new Date(2026, 8, 16, 0, 10).toISOString() },
    ]);
    expect(m.get("2026-09-15")?.map((i) => i.id)).toEqual(["a"]);
    expect(m.get("2026-09-16")?.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("tituloDoPeriodo", () => {
  it("formata semana no mesmo mês, entre meses e mês inteiro", () => {
    expect(tituloDoPeriodo(quarta, "semana")).toBe("14–20 de setembro de 2026");
    expect(tituloDoPeriodo(new Date(2026, 8, 30), "semana")).toBe("28 de set. – 4 de out. de 2026");
    expect(tituloDoPeriodo(quarta, "mes")).toBe("Setembro de 2026");
  });

  it("addDias não muta a data original", () => {
    const original = new Date(2026, 8, 16);
    addDias(original, 3);
    expect(chaveDia(original)).toBe("2026-09-16");
  });
});

describe("moverParaDia", () => {
  it("leva a ação para o novo dia mantendo o horário", () => {
    const original = new Date(2026, 8, 19, 10, 30).toISOString();
    const movido = new Date(moverParaDia(original, new Date(2026, 8, 22)));
    expect(chaveDia(movido)).toBe("2026-09-22");
    expect([movido.getHours(), movido.getMinutes()]).toEqual([10, 30]);
  });

  it("atravessa virada de mês e diaDaChave é o inverso de chaveDia", () => {
    const original = new Date(2026, 8, 30, 23, 45).toISOString();
    expect(chaveDia(new Date(moverParaDia(original, diaDaChave("2026-10-02"))))).toBe("2026-10-02");
    expect(chaveDia(diaDaChave("2026-12-31"))).toBe("2026-12-31");
  });
});
