import { describe, expect, it } from "vitest";
import { casarComPrevisao, motivoDoNaoCasamento, type PrevisaoCandidata } from "./casamento-previsao";

const prev = (id: string, valor: number, vencimento: string | null): PrevisaoCandidata => ({
  lancamentoId: `l-${id}`,
  parcelaId: `p-${id}`,
  descricao: `Parcela ${id}`,
  valor,
  vencimento,
});

describe("casarComPrevisao", () => {
  it("valor exato e data próxima: casa", () => {
    const r = casarComPrevisao([prev("1", 5000, "2026-10-10")], { valor: 5000, vencimento: "2026-10-15" });
    expect(r.casou && r.candidata.parcelaId).toBe("p-1");
  });

  it("centavos contam: 5000,00 não casa com 5000,01", () => {
    const r = casarComPrevisao([prev("1", 5000, "2026-10-10")], { valor: 5000.01, vencimento: "2026-10-10" });
    expect(r).toEqual({ casou: false, motivo: "valor_diferente" });
  });

  it("projeto sem previsão: não casa, e não há nada a avisar", () => {
    const r = casarComPrevisao([], { valor: 5000, vencimento: "2026-10-10" });
    expect(r).toEqual({ casou: false, motivo: "sem_previsao" });
    expect(motivoDoNaoCasamento(r)).toBeNull();
  });

  it("data muito distante é outra parcela", () => {
    const r = casarComPrevisao([prev("1", 5000, "2026-10-10")], { valor: 5000, vencimento: "2027-03-10" });
    expect(r).toEqual({ casou: false, motivo: "data_longe" });
    expect(motivoDoNaoCasamento(r)).toContain("muito distante");
  });

  it("duas do mesmo valor: vence a de data mais próxima", () => {
    const r = casarComPrevisao([prev("1", 5000, "2026-10-01"), prev("2", 5000, "2026-11-20")], {
      valor: 5000,
      vencimento: "2026-11-18",
    });
    expect(r.casou && r.candidata.parcelaId).toBe("p-2");
  });

  it("empate exato de data: ambígua, o sistema NÃO escolhe", () => {
    const r = casarComPrevisao([prev("1", 5000, "2026-10-05"), prev("2", 5000, "2026-10-15")], {
      valor: 5000,
      vencimento: "2026-10-10",
    });
    expect(r).toEqual({ casou: false, motivo: "ambigua" });
    expect(motivoDoNaoCasamento(r)).toContain("mais de uma previsão");
  });

  it("previsão sem data (marco sem data) casa quando é a única do valor", () => {
    const r = casarComPrevisao([prev("1", 5000, null)], { valor: 5000, vencimento: "2026-10-10" });
    expect(r.casou && r.candidata.parcelaId).toBe("p-1");
  });

  it("previsão sem data perde de uma datada dentro da janela", () => {
    const r = casarComPrevisao([prev("1", 5000, null), prev("2", 5000, "2026-10-12")], {
      valor: 5000,
      vencimento: "2026-10-10",
    });
    expect(r.casou && r.candidata.parcelaId).toBe("p-2");
  });

  it("duas sem data e mesmo valor: ambígua", () => {
    const r = casarComPrevisao([prev("1", 5000, null), prev("2", 5000, null)], {
      valor: 5000,
      vencimento: "2026-10-10",
    });
    expect(r).toEqual({ casou: false, motivo: "ambigua" });
  });

  it("valor diferente avisa que existe previsão no projeto", () => {
    const r = casarComPrevisao([prev("1", 4000, "2026-10-10")], { valor: 5000, vencimento: "2026-10-10" });
    expect(motivoDoNaoCasamento(r)).toContain("nenhuma com este valor exato");
  });
});
