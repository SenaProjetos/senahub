import { describe, expect, it } from "vitest";
import { mesesDaTela } from "./meses";

describe("meses da tela do rateio", () => {
  it("mês em curso + 12 terminados, do mais novo ao mais antigo", () => {
    const r = mesesDaTela({ corte: "2026-10", hojeSP: "2026-11-05", fechados: [] });
    expect(r.map((m) => m.chave)).toEqual([
      "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12", "2025-11",
    ]);
    expect(r[0].emCurso).toBe(true);
    expect(r.slice(1).every((m) => !m.emCurso)).toBe(true);
  });

  it("mês aberto antigo desde o corte não some, mesmo fora dos 12", () => {
    const r = mesesDaTela({ corte: "2026-10", hojeSP: "2028-03-10", fechados: ["2026-11", "2026-12"] });
    const chaves = r.map((m) => m.chave);
    expect(chaves).toContain("2026-10");
    expect(chaves).not.toContain("2026-11");
    expect(chaves.indexOf("2026-10")).toBe(chaves.length - 1);
  });

  it("antes do corte não inventa meses abertos", () => {
    const r = mesesDaTela({ corte: "2027-01", hojeSP: "2026-11-05", fechados: [] });
    expect(r).toHaveLength(13);
  });

  it("virada de ano", () => {
    const r = mesesDaTela({ corte: "2026-10", hojeSP: "2027-01-02", fechados: [] });
    expect(r[0].chave).toBe("2027-01");
    expect(r[1].chave).toBe("2026-12");
  });
});
