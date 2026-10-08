import { describe, expect, it } from "vitest";
import {
  ATALHOS,
  bucketsDoPeriodo,
  intervaloDoAtalho,
  LIMITE_DIARIO,
  listarDias,
  resolverPeriodo,
  somarDias,
} from "./periodo";

const HOJE = "2026-10-07"; // quarta-feira

describe("somarDias / listarDias", () => {
  it("atravessa virada de mês e de ano", () => {
    expect(somarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("lista o intervalo inclusive nas duas pontas", () => {
    expect(listarDias("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
  it("um dia só", () => {
    expect(listarDias(HOJE, HOJE)).toEqual([HOJE]);
  });
});

describe("intervaloDoAtalho", () => {
  it("N dias terminam hoje e contam hoje", () => {
    expect(intervaloDoAtalho("7d", HOJE)).toEqual({ de: "2026-10-01", ate: HOJE });
    expect(intervaloDoAtalho("14d", HOJE)).toEqual({ de: "2026-09-24", ate: HOJE });
    expect(intervaloDoAtalho("30d", HOJE)).toEqual({ de: "2026-09-08", ate: HOJE });
  });
  it("mês atual vai do dia 1 até hoje", () => {
    expect(intervaloDoAtalho("mes_atual", HOJE)).toEqual({ de: "2026-10-01", ate: HOJE });
  });
  it("mês anterior é o mês fechado, inclusive em janeiro", () => {
    expect(intervaloDoAtalho("mes_anterior", HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(intervaloDoAtalho("mes_anterior", "2026-01-15")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(intervaloDoAtalho("mes_anterior", "2026-03-10")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });
  it("todo atalho tem rótulo", () => {
    expect(ATALHOS.map((a) => a.id)).toEqual(["7d", "14d", "30d", "mes_atual", "mes_anterior"]);
  });
});

describe("resolverPeriodo", () => {
  it("sem parâmetro = últimos 14 dias, diário", () => {
    expect(resolverPeriodo({}, HOJE)).toEqual({ de: "2026-09-24", ate: HOJE, atalho: "14d", granularidade: "dia" });
  });
  it("intervalo livre válido é respeitado e reconhece o atalho equivalente", () => {
    expect(resolverPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, HOJE)).toEqual({
      de: "2026-09-01",
      ate: "2026-09-30",
      atalho: "mes_anterior",
      granularidade: "dia",
    });
    expect(resolverPeriodo({ de: "2026-09-10", ate: "2026-09-20" }, HOJE).atalho).toBeNull();
  });
  it("ate no futuro é cortado em hoje", () => {
    expect(resolverPeriodo({ de: "2026-10-01", ate: "2026-12-31" }, HOJE)).toMatchObject({ de: "2026-10-01", ate: HOJE });
  });
  it.each([
    [{ de: "abc", ate: HOJE }],
    [{ de: "2026-02-30", ate: "2026-03-05" }],
    [{ de: "2026-10-05", ate: "2026-10-01" }],
    [{ de: "2026-11-01", ate: "2026-11-30" }],
    [{ de: "2026-10-01" }],
    // ano absurdo (digitação no campo de data): centenas de milhares de dias derrubariam o processo
    [{ de: "1000-01-01", ate: HOJE }],
    [{ de: "0206-10-01", ate: HOJE }],
    [{ de: "1999-12-31", ate: HOJE }],
  ])("parâmetro inválido cai no padrão (%o)", (params) => {
    expect(resolverPeriodo(params, HOJE)).toMatchObject({ de: "2026-09-24", ate: HOJE, atalho: "14d" });
  });
  it(`até ${LIMITE_DIARIO} dias é diário; acima agrupa por semana`, () => {
    const de92 = somarDias(HOJE, -(LIMITE_DIARIO - 1));
    expect(resolverPeriodo({ de: de92, ate: HOJE }, HOJE).granularidade).toBe("dia");
    const de93 = somarDias(HOJE, -LIMITE_DIARIO);
    expect(resolverPeriodo({ de: de93, ate: HOJE }, HOJE).granularidade).toBe("semana");
  });
});

describe("bucketsDoPeriodo", () => {
  it("diário = um bucket por dia", () => {
    const dias = listarDias("2026-10-05", "2026-10-07");
    expect(bucketsDoPeriodo(dias, "dia")).toEqual([
      { inicio: "2026-10-05", fim: "2026-10-05", indices: [0] },
      { inicio: "2026-10-06", fim: "2026-10-06", indices: [1] },
      { inicio: "2026-10-07", fim: "2026-10-07", indices: [2] },
    ]);
  });
  it("semanal começa no 1º dia do período (quarta) e quebra na segunda seguinte", () => {
    // 2026-09-30 é quarta; 2026-10-05 é segunda.
    const dias = listarDias("2026-09-30", "2026-10-13");
    const b = bucketsDoPeriodo(dias, "semana");
    expect(b.map((x) => [x.inicio, x.fim])).toEqual([
      ["2026-09-30", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-13"],
    ]);
    // nenhum dia perdido nem repetido
    expect(b.flatMap((x) => x.indices)).toEqual(dias.map((_, i) => i));
  });
});
