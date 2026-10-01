import { describe, expect, it } from "vitest";
import { dataValida, diaDaSemana, diaMes, diasEntre, somarDias } from "@/modules/financeiro/liquidez/datas";

describe("datas em string (mesmo resultado no servidor e no navegador)", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("conta dias entre datas", () => {
    expect(diasEntre("2026-10-01", "2026-10-31")).toBe(30);
    expect(diasEntre("2026-10-31", "2026-10-01")).toBe(-30);
  });
  it("dia da semana e dd/mm", () => {
    expect(diaDaSemana("2026-10-01")).toBe("qui");
    expect(diaDaSemana("2026-10-05")).toBe("seg");
    expect(diaMes("2026-10-05")).toBe("05/10");
  });
  it("só aceita datas que existem", () => {
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("2026-10-01")).toBe(true);
    expect(dataValida("01/10/2026")).toBe(false);
  });
});
