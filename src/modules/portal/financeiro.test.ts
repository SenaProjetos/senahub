import { describe, expect, it } from "vitest";
import { entraNoPortal, financeiroDoCliente, parcelaDoCliente, type RecebivelDoCliente } from "./financeiro";

const HOJE = "2026-11-19";

function r(p: Partial<RecebivelDoCliente> = {}): RecebivelDoCliente {
  return {
    id: "l1",
    status: "previsto",
    valor: "1000.00",
    valorEfetivo: null,
    data: "2026-11-01",
    vencimento: "2026-11-30",
    dataConfirmacao: null,
    retidoCentavos: 0,
    projeto: { codigo: "2026-001", nome: "Residencial" },
    ...p,
  };
}

describe("parcelaDoCliente", () => {
  it("em aberto com vencimento hoje ou depois = a vencer", () => {
    expect(parcelaDoCliente(r({ vencimento: HOJE }), HOJE).situacao).toBe("a_vencer");
    expect(parcelaDoCliente(r({ vencimento: "2026-12-10" }), HOJE).situacao).toBe("a_vencer");
  });

  it("em aberto com vencimento antes de hoje = vencida", () => {
    expect(parcelaDoCliente(r({ vencimento: "2026-11-18" }), HOJE).situacao).toBe("vencida");
  });

  it("sem vencimento usa a data do lançamento", () => {
    const p = parcelaDoCliente(r({ vencimento: null, data: "2026-10-05" }), HOJE);
    expect(p.vencimento).toBe("2026-10-05");
    expect(p.situacao).toBe("vencida");
  });

  it("paga mostra o valor pago e a data do pagamento", () => {
    const p = parcelaDoCliente(
      r({ status: "confirmado", valorEfetivo: "400.00", dataConfirmacao: "2026-11-10" }),
      HOJE,
    );
    expect(p).toMatchObject({ situacao: "paga", valorCentavos: 40000, pagaEm: "2026-11-10" });
  });

  it("paga sem data de confirmação cai na data do lançamento", () => {
    expect(parcelaDoCliente(r({ status: "confirmado", data: "2026-09-01" }), HOJE).pagaEm).toBe("2026-09-01");
  });

  it("vencimento passado não torna vencida uma parcela paga", () => {
    expect(parcelaDoCliente(r({ status: "confirmado", vencimento: "2026-01-01" }), HOJE).situacao).toBe("paga");
  });

  it("valor é o líquido das retenções, nunca negativo", () => {
    expect(parcelaDoCliente(r({ retidoCentavos: 15000 }), HOJE).valorCentavos).toBe(85000);
    expect(parcelaDoCliente(r({ valor: "10.00", retidoCentavos: 5000 }), HOJE).valorCentavos).toBe(0);
  });
});

describe("financeiroDoCliente", () => {
  it("ordena em aberto pelo vencimento e pagas pela mais recente, e soma cada situação", () => {
    const f = financeiroDoCliente(
      [
        r({ id: "a", vencimento: "2026-12-20", valor: "300" }),
        r({ id: "b", vencimento: "2026-11-01", valor: "200" }),
        r({ id: "c", status: "confirmado", dataConfirmacao: "2026-08-01", valor: "100" }),
        r({ id: "d", status: "confirmado", dataConfirmacao: "2026-10-01", valor: "50.5" }),
      ],
      HOJE,
    );
    expect(f.emAberto.map((p) => p.id)).toEqual(["b", "a"]);
    expect(f.pagas.map((p) => p.id)).toEqual(["d", "c"]);
    expect(f.totais).toEqual({ vencidoCentavos: 20000, aVencerCentavos: 30000, pagoCentavos: 15050 });
  });

  it("lista vazia dá zero em tudo", () => {
    expect(financeiroDoCliente([], HOJE)).toEqual({
      emAberto: [],
      pagas: [],
      totais: { vencidoCentavos: 0, aVencerCentavos: 0, pagoCentavos: 0 },
    });
  });
});

describe("entraNoPortal", () => {
  it("licitação (projeto ou categoria) fica fora, salvo com a cobrança de licitação ligada", () => {
    const pelaCategoria = { projetoTipo: null, chavesDaCategoria: ["receita_licitacoes", "receita"] };
    const peloProjeto = { projetoTipo: "licitacao", chavesDaCategoria: [] };
    expect(entraNoPortal({ ...pelaCategoria, cobrarLicitacao: false })).toBe(false);
    expect(entraNoPortal({ ...peloProjeto, cobrarLicitacao: false })).toBe(false);
    expect(entraNoPortal({ ...peloProjeto, cobrarLicitacao: true })).toBe(true);
  });

  it("particular entra sempre", () => {
    expect(entraNoPortal({ projetoTipo: "particular", chavesDaCategoria: ["receita"], cobrarLicitacao: false })).toBe(true);
  });
});
