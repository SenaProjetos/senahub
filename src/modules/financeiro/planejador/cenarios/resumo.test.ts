import { describe, expect, it } from "vitest";
import { EIXOS_PADRAO } from "@/modules/financeiro/liquidez/cenario";
import { dia, evento, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";
import { nomePadraoDoCenario, resumoDoCenario } from "@/modules/financeiro/planejador/cenarios/resumo";

// Números do pedido (mock): caixa 87.500, reserva 30.000.
const base = {
  hoje: HOJE,
  caixaAtual: reais(87_500),
  reservaMinima: reais(30_000),
  caixinhas: [],
  eventos: [
    evento({ id: "folha", tipo: "despesa", valor: reais(24_000), data: dia(4) }),
    evento({ id: "fornecedor", tipo: "despesa", valor: reais(15_000), data: dia(9) }),
    evento({ id: "cliente", tipo: "receita", valor: reais(15_000), data: dia(14) }),
  ],
};
const premissas = { eixos: EIXOS_PADRAO, horizonteDias: 30 };

describe("resumoDoCenario", () => {
  it("sem ajustes: situação atual, série do tamanho do horizonte", () => {
    const r = resumoDoCenario(base, premissas, []);
    expect(r.saldoFinal).toBe(reais(87_500 - 24_000 - 15_000 + 15_000));
    expect(r.menorSaldo).toBe(reais(48_500));
    expect(r.situacao).toBe("ok");
    expect(r.serie).toHaveLength(30);
  });

  it("distribuição de 20 mil leva o menor saldo abaixo da reserva", () => {
    const r = resumoDoCenario(base, premissas, [
      { tipo: "INCLUIR", id: "d", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(10), descricao: "Distribuição" } },
    ]);
    expect(r.menorSaldo).toBe(reais(28_500));
    expect(r.situacao).toBe("reserva");
  });

  it("déficit quando o caixa fica negativo", () => {
    const r = resumoDoCenario(base, premissas, [
      { tipo: "INCLUIR", id: "d", movimento: { tipo: "despesa", natureza: "resultado", valor: reais(60_000), data: dia(10), descricao: "Grande" } },
    ]);
    expect(r.situacao).toBe("deficit");
  });

  it("não muta a base", () => {
    const copia = JSON.parse(JSON.stringify(base));
    resumoDoCenario(base, premissas, [{ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }]);
    expect(base).toEqual(copia);
  });
});

describe("nomePadraoDoCenario", () => {
  it("mês de hoje + contagem", () => {
    expect(nomePadraoDoCenario("2026-10-01", 1)).toBe("Outubro, 1 ajuste");
    expect(nomePadraoDoCenario("2026-03-15", 3)).toBe("Março, 3 ajustes");
  });
});
