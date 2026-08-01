import { describe, it, expect } from "vitest";
import {
  esperadoPorDiaMes,
  somarEsperadoAte,
  pisoApuracao,
  diasNoMes,
  diaSemanaISO,
  type EntradaEsperado,
} from "./esperado";

/** Grade seg–sex de `h` horas (0=domingo..6=sábado). */
const semana = (h: number) =>
  Array.from({ length: 7 }, (_, d) => ({ ativo: d >= 1 && d <= 5, horasDia: h }));

const base = (over: Partial<EntradaEsperado> = {}): EntradaEsperado => ({
  ano: 2026,
  mes: 6, // jun/2026: começa numa segunda, 22 dias úteis
  escala: semana(8),
  feriados: new Set<string>(),
  ferias: new Set<string>(),
  piso: null,
  teto: null,
  controlaJornada: true,
  ...over,
});

const somar = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

describe("diasNoMes / diaSemanaISO", () => {
  it("conta os dias do mês, inclusive fevereiro bissexto", () => {
    expect(diasNoMes(2026, 6)).toBe(30);
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2028, 2)).toBe(29);
  });

  it("resolve o dia da semana sem depender do fuso do servidor", () => {
    expect(diaSemanaISO("2026-06-01")).toBe(1); // segunda
    expect(diaSemanaISO("2026-06-06")).toBe(6); // sábado
    expect(diaSemanaISO("2026-06-07")).toBe(0); // domingo
  });
});

describe("esperadoPorDiaMes", () => {
  it("mês cheio de CLT: 22 dias úteis × 8h", () => {
    expect(somar(esperadoPorDiaMes(base()))).toBe(22 * 480);
  });

  it("estagiário 6h: mesmo calendário, jornada menor", () => {
    expect(somar(esperadoPorDiaMes(base({ escala: semana(6) })))).toBe(22 * 360);
  });

  it("mapa cobre TODOS os dias do mês (zerados inclusive) — contrato do filtro por período", () => {
    const m = esperadoPorDiaMes(base());
    expect(Object.keys(m)).toHaveLength(30);
    expect(m["2026-06-06"]).toBe(0); // sábado
    expect(m["2026-06-01"]).toBe(480);
  });

  it("feriado e férias zeram o dia", () => {
    const m = esperadoPorDiaMes(
      base({ feriados: new Set(["2026-06-04"]), ferias: new Set(["2026-06-15", "2026-06-16"]) }),
    );
    expect(m["2026-06-04"]).toBe(0);
    expect(m["2026-06-15"]).toBe(0);
    expect(somar(m)).toBe((22 - 3) * 480);
  });

  // ── Cenário: colaborador admitido no meio do mês ──────────────────────────
  it("admitido no meio do mês só deve horas a partir da admissão", () => {
    // Piso 15/06 (segunda): dias úteis 15–19, 22–26, 29, 30 = 12.
    const m = esperadoPorDiaMes(base({ piso: "2026-06-15" }));
    expect(m["2026-06-12"]).toBe(0); // sexta anterior à admissão
    expect(m["2026-06-15"]).toBe(480);
    expect(somar(m)).toBe(12 * 480);
  });

  it("mês inteiro anterior ao vínculo não gera nenhuma hora esperada", () => {
    // Bug original: vínculo iniciado em jul/2026 acumulava −176h em jun/2026.
    expect(somar(esperadoPorDiaMes(base({ piso: "2026-07-04" })))).toBe(0);
  });

  // ── Cenário: desligamento no meio do mês (teto) ───────────────────────────
  it("desligado no meio do mês para de acumular a partir do dia seguinte", () => {
    // Teto 10/06 (quarta): dias úteis 01–05 e 08–10 = 8.
    const m = esperadoPorDiaMes(base({ teto: "2026-06-10" }));
    expect(m["2026-06-10"]).toBe(480);
    expect(m["2026-06-11"]).toBe(0);
    expect(somar(m)).toBe(8 * 480);
  });

  it("piso e teto no mesmo mês recortam as duas pontas", () => {
    // 08/06 (seg) a 12/06 (sex) = 5 dias úteis.
    expect(somar(esperadoPorDiaMes(base({ piso: "2026-06-08", teto: "2026-06-12" })))).toBe(5 * 480);
  });

  // ── Cenário: contratação sem jornada controlada ───────────────────────────
  it("não-CLT/não-estagiário não acumula NENHUMA hora esperada", () => {
    const m = esperadoPorDiaMes(base({ controlaJornada: false }));
    expect(somar(m)).toBe(0);
    expect(Object.keys(m)).toHaveLength(30); // mapa completo, todo zerado
  });

  it("controlaJornada:false vence piso, escala e feriado", () => {
    const m = esperadoPorDiaMes(
      base({ controlaJornada: false, escala: semana(8), piso: "2026-06-01", teto: "2026-06-30" }),
    );
    expect(somar(m)).toBe(0);
  });

  // ── Escala não-uniforme: a divergência que a unificação corrige ───────────
  it("usa o horasDia REAL de cada dia da semana, não o maior da grade", () => {
    // 8h seg–qui + 4h sex. O cálculo antigo (`max(horasDia)` × seg–sex) daria 22×8h.
    const escala = Array.from({ length: 7 }, (_, d) => ({
      ativo: d >= 1 && d <= 5,
      horasDia: d === 5 ? 4 : 8,
    }));
    // jun/2026 tem 4 sextas (05, 12, 19, 26) e 18 outros dias úteis.
    expect(somar(esperadoPorDiaMes(base({ escala })))).toBe(18 * 480 + 4 * 240);
  });

  it("sábado ativo na grade conta (o cálculo antigo ignorava)", () => {
    const escala = Array.from({ length: 7 }, (_, d) => ({ ativo: d >= 1 && d <= 6, horasDia: 8 }));
    // jun/2026 tem 4 sábados (06, 13, 20, 27).
    expect(somar(esperadoPorDiaMes(base({ escala })))).toBe(26 * 480);
  });
});

describe("somarEsperadoAte", () => {
  it("mês corrente: só os dias já decorridos entram", () => {
    const m = esperadoPorDiaMes(base());
    // Até 05/06 (sexta): 5 dias úteis.
    expect(somarEsperadoAte(m, "2026-06-05")).toBe(5 * 480);
  });

  it("mês passado soma tudo; mês futuro soma zero", () => {
    const m = esperadoPorDiaMes(base());
    expect(somarEsperadoAte(m, "2026-07-31")).toBe(22 * 480);
    expect(somarEsperadoAte(m, "2026-05-31")).toBe(0);
  });
});

describe("pisoApuracao", () => {
  it("sem vínculo e sem registro → sem piso", () => {
    expect(pisoApuracao(null, null)).toBeNull();
  });

  it("usa o que existir quando só um está definido", () => {
    expect(pisoApuracao("2026-03-01", null)).toBe("2026-03-01");
    expect(pisoApuracao(null, "2026-07-04")).toBe("2026-07-04");
  });

  it("vínculo antigo + ponto recente → vence o primeiro registro", () => {
    // Vínculo de 2020 e ponto eletrônico só a partir de jul/2026: cobrar desde
    // 2020 transformaria "o sistema não existia" em falta.
    expect(pisoApuracao("2020-01-15", "2026-07-04")).toBe("2026-07-04");
  });

  it("admissão posterior ao primeiro registro → vence a admissão", () => {
    expect(pisoApuracao("2026-07-20", "2026-07-04")).toBe("2026-07-20");
  });
});
