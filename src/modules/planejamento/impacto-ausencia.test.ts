import { describe, expect, it } from "vitest";
import { impactoDaAusencia, janelaDeImpacto, textoDoImpacto } from "./impacto-ausencia";

describe("janelaDeImpacto", () => {
  it("ausência futura inteira vale", () => {
    expect(janelaDeImpacto({ inicio: "2026-11-02", fim: "2026-11-20" }, "2026-10-01")).toEqual({
      inicio: "2026-11-02",
      fim: "2026-11-20",
    });
  });

  it("ausência em curso começa hoje", () => {
    expect(janelaDeImpacto({ inicio: "2026-09-20", fim: "2026-10-10" }, "2026-10-01")).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-10",
    });
  });

  it("ausência que já terminou não gera aviso", () => {
    expect(janelaDeImpacto({ inicio: "2026-09-01", fim: "2026-09-30" }, "2026-10-01")).toBeNull();
  });

  it("período invertido não gera aviso", () => {
    expect(janelaDeImpacto({ inicio: "2026-11-10", fim: "2026-11-01" }, "2026-10-01")).toBeNull();
  });
});

describe("impactoDaAusencia", () => {
  const janela = { inicio: "2026-11-02", fim: "2026-11-20" };

  it("férias em novembro não pegam alocação que termina em outubro", () => {
    const r = impactoDaAusencia(janela, [{ projetoId: "p1", percentual: 50, inicio: "2026-08-01", fim: "2026-10-31" }], []);
    expect(r).toEqual([]);
  });

  it("alocação sem datas vale na janela inteira", () => {
    const r = impactoDaAusencia(janela, [{ projetoId: "p1", percentual: 80, inicio: null, fim: null }], []);
    expect(r).toEqual([{ projetoId: "p1", percentual: 80, horas: 0, inicio: "2026-11-02", fim: "2026-11-20" }]);
  });

  it("recorta a alocação ao trecho que coincide", () => {
    const r = impactoDaAusencia(janela, [{ projetoId: "p1", percentual: 30, inicio: "2026-11-10", fim: "2027-01-31" }], []);
    expect(r[0]).toMatchObject({ inicio: "2026-11-10", fim: "2026-11-20", percentual: 30 });
  });

  it("faixas do mesmo projeto somam e alargam o trecho", () => {
    const r = impactoDaAusencia(
      janela,
      [
        { projetoId: "p1", percentual: 20, inicio: "2026-11-02", fim: "2026-11-05" },
        { projetoId: "p1", percentual: 40, inicio: "2026-11-15", fim: null },
      ],
      [],
    );
    expect(r).toEqual([{ projetoId: "p1", percentual: 60, horas: 0, inicio: "2026-11-02", fim: "2026-11-20" }]);
  });

  it("horas do cronograma contam só dentro da janela", () => {
    const porDia = new Map([
      ["2026-10-30", 8],
      ["2026-11-03", 4],
      ["2026-11-04", 2.25],
      ["2026-11-21", 8],
    ]);
    const r = impactoDaAusencia(janela, [], [{ projetoId: "p2", porDia }]);
    expect(r).toEqual([{ projetoId: "p2", percentual: 0, horas: 6.3, inicio: "2026-11-03", fim: "2026-11-04" }]);
  });

  it("alocação de 0% e projeto sem hora na janela ficam fora", () => {
    const r = impactoDaAusencia(
      janela,
      [{ projetoId: "p1", percentual: 0, inicio: null, fim: null }],
      [{ projetoId: "p2", porDia: new Map([["2026-12-01", 8]]) }],
    );
    expect(r).toEqual([]);
  });

  it("ordena pelo início do trecho", () => {
    const r = impactoDaAusencia(
      janela,
      [
        { projetoId: "b", percentual: 10, inicio: "2026-11-15", fim: null },
        { projetoId: "a", percentual: 10, inicio: null, fim: null },
      ],
      [],
    );
    expect(r.map((p) => p.projetoId)).toEqual(["a", "b"]);
  });
});

describe("textoDoImpacto", () => {
  it("férias citam período e projetos", () => {
    const t = textoDoImpacto({
      nome: "Ana",
      tipo: "ferias",
      janela: { inicio: "2026-11-02", fim: "2026-11-20" },
      projetos: [
        { codigo: "2026-012", percentual: 50, horas: 0 },
        { codigo: "2026-015", percentual: 0, horas: 12.5 },
      ],
    });
    expect(t.titulo).toBe("Férias afetam alocação: Ana");
    expect(t.corpo).toContain("Férias de Ana aprovadas");
    expect(t.corpo).toContain("de 02/11/2026 a 20/11/2026");
    expect(t.corpo).toContain("2026-012 (50%)");
    expect(t.corpo).toContain("2026-015 (12,5 h no cronograma)");
    expect(t.corpo).toContain("nada foi alterado automaticamente");
  });

  it("abono não expõe o motivo e dia único sai como 'em'", () => {
    const t = textoDoImpacto({
      nome: "Bia",
      tipo: "ausencia",
      janela: { inicio: "2026-11-05", fim: "2026-11-05" },
      projetos: [{ codigo: "2026-001", percentual: 20, horas: 3 }],
    });
    expect(t.titulo).toBe("Ausência afeta alocação: Bia");
    expect(t.corpo).toContain("em 05/11/2026");
    expect(t.corpo).toContain("2026-001 (20% + 3 h no cronograma)");
    expect(t.corpo).not.toMatch(/atestado|abono/i);
  });
});
