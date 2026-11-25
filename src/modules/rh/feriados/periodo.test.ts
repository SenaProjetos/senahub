import { describe, expect, it } from "vitest";
import {
  agruparRecessos,
  diasDoPeriodo,
  diasLivresDoRecesso,
  MAX_DIAS_RECESSO,
  motivoPeriodoInvalido,
  semRecesso,
} from "./periodo";

describe("motivoPeriodoInvalido", () => {
  it("período válido", () => expect(motivoPeriodoInvalido("2026-12-23", "2027-01-02")).toBeNull());
  it("um dia só vale", () => expect(motivoPeriodoInvalido("2026-12-24", "2026-12-24")).toBeNull());
  it("data vazia ou inexistente", () => {
    expect(motivoPeriodoInvalido("", "2026-12-24")).toMatch(/Informe/);
    expect(motivoPeriodoInvalido("2026-02-30", "2026-03-02")).toMatch(/Informe/);
  });
  it("fim antes do início", () => expect(motivoPeriodoInvalido("2026-12-24", "2026-12-23")).toMatch(/antes da inicial/));
  it("teto de dias", () => {
    expect(motivoPeriodoInvalido("2026-01-01", "2026-03-03")).toBeNull(); // 62 dias
    expect(motivoPeriodoInvalido("2026-01-01", "2026-03-04")).toBe(`O recesso pode ter no máximo ${MAX_DIAS_RECESSO} dias.`);
  });
});

describe("diasDoPeriodo", () => {
  it("inclusivo e atravessa o ano", () =>
    expect(diasDoPeriodo("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]));
  it("período inválido = vazio", () => expect(diasDoPeriodo("2026-12-24", "2026-12-23")).toEqual([]));
});

describe("diasLivresDoRecesso", () => {
  it("pula dia já cadastrado e feriado recorrente; fim de semana entra", () => {
    const livres = diasLivresDoRecesso("2026-12-23", "2027-01-02", new Set(["2027-01-01"]), new Set(["12-25"]));
    expect(livres).not.toContain("2026-12-25");
    expect(livres).not.toContain("2027-01-01");
    expect(livres).toContain("2026-12-26"); // sábado
    expect(livres).toHaveLength(9);
  });
});

describe("semRecesso", () => {
  it("tira só o recesso", () =>
    expect(semRecesso([{ tipo: "nacional" }, { tipo: "recesso" }, { tipo: "municipal" }]).map((f) => f.tipo)).toEqual([
      "nacional",
      "municipal",
    ]));
});

describe("agruparRecessos", () => {
  const r = (data: string, nome = "Recesso de fim de ano") => ({ id: `r-${data}`, data, nome, tipo: "recesso", origem: "unico" as const });
  const f = (data: string, nome: string) => ({ id: `f-${data}`, data, nome, tipo: "nacional", origem: "unico" as const });

  it("dias seguidos viram uma linha; o Natal no meio não parte o recesso e aparece na própria linha", () => {
    const linhas = agruparRecessos([r("2026-12-23"), r("2026-12-24"), f("2026-12-25", "Natal"), r("2026-12-26"), r("2026-12-27")]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      tipo: "recesso",
      nome: "Recesso de fim de ano",
      inicio: "2026-12-23",
      fim: "2026-12-27",
      ids: ["r-2026-12-23", "r-2026-12-24", "r-2026-12-26", "r-2026-12-27"],
    });
    expect(linhas[1]).toMatchObject({ tipo: "dia", feriado: { nome: "Natal" } });
  });

  it("buraco sem feriado separa; nome diferente separa", () => {
    const linhas = agruparRecessos([r("2026-07-01"), r("2026-07-03"), r("2026-07-04", "Ponte"), f("2026-09-07", "Independência")]);
    expect(linhas.map((l) => l.tipo)).toEqual(["recesso", "recesso", "recesso", "dia"]);
  });
});
