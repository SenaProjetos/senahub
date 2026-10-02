import { describe, expect, it } from "vitest";
import { edicaoMexeNoFechado, mesDe, motivoPeriodoFechado } from "@/modules/financeiro/fechamento/trava";

const fechados = new Set(["2026-03", "2026-04"]);

describe("motivoPeriodoFechado (N5)", () => {
  it("data em mês aberto passa", () => {
    expect(motivoPeriodoFechado([new Date("2026-05-01T00:00:00.000Z"), null], fechados)).toBeNull();
  });
  it("data do banco no dia 1º é do próprio mês (UTC), não do anterior", () => {
    expect(mesDe(new Date("2026-05-01T00:00:00.000Z"))).toBe("2026-05");
    expect(motivoPeriodoFechado(["2026-03-31"], fechados)).toBe("Março/2026 está fechado: reabra o mês em Fechamento mensal antes de mexer nos lançamentos dele.");
  });
  it("vários meses fechados na frase, em ordem e sem repetir", () => {
    expect(motivoPeriodoFechado(["2026-04-10", "2026-03-02", "2026-04-20"], fechados)).toBe(
      "Março/2026 e abril/2026 estão fechados: reabra o mês em Fechamento mensal antes de mexer nos lançamentos dele.",
    );
  });
});

describe("edicaoMexeNoFechado", () => {
  const antes = { valor: "100.00", categoriaId: "c1", data: new Date("2026-03-10T00:00:00.000Z"), dataCompetencia: null, contaId: null, centroId: null, projetoId: null };
  it("descrição, vencimento ou observação não contam", () => {
    expect(edicaoMexeNoFechado(antes, { valor: "100.00", categoriaId: "c1", data: "2026-03-10", dataCompetencia: "", contaId: "", centroId: "", projetoId: "" })).toBe(false);
  });
  it("valor, categoria, data, centro ou projeto contam", () => {
    expect(edicaoMexeNoFechado(antes, { valor: "100.01" })).toBe(true);
    expect(edicaoMexeNoFechado(antes, { categoriaId: "c2" })).toBe(true);
    expect(edicaoMexeNoFechado(antes, { data: "2026-03-11" })).toBe(true);
    expect(edicaoMexeNoFechado(antes, { projetoId: "p1" })).toBe(true);
  });
});
