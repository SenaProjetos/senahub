import { describe, expect, it } from "vitest";
import { diasDeCaixa, impactoPercentual, necessidadeParaReserva } from "@/modules/financeiro/liquidez/indicadores";
import { dia, reais } from "@/modules/financeiro/liquidez/fixtures";

describe("dias de caixa (spec §13)", () => {
  const ok = { diasDeHistorico: 120 };

  it("caixa atual ÷ média diária das saídas de 90 dias", () => {
    // 45 mil em 90 dias = 500/dia; 90 mil de caixa ⇒ 180 dias.
    expect(diasDeCaixa({ caixaAtual: reais(90_000), saidasNaJanela: reais(45_000), ...ok })).toEqual({ tipo: "dias", dias: 180, maisDe365: false });
  });

  it("caixa zerado ou negativo ⇒ zero dias", () => {
    expect(diasDeCaixa({ caixaAtual: 0, saidasNaJanela: reais(100), ...ok })).toEqual({ tipo: "zero" });
    expect(diasDeCaixa({ caixaAtual: reais(-5), saidasNaJanela: reais(100), ...ok })).toEqual({ tipo: "zero" });
  });

  it("sem saídas ou com menos de 30 dias de histórico ⇒ indisponível com motivo", () => {
    expect(diasDeCaixa({ caixaAtual: reais(100), saidasNaJanela: 0, ...ok })).toMatchObject({ tipo: "indisponivel", motivo: expect.stringContaining("Sem saídas") });
    expect(diasDeCaixa({ caixaAtual: reais(100), saidasNaJanela: reais(10), diasDeHistorico: 29 })).toMatchObject({ tipo: "indisponivel", motivo: expect.stringContaining("insuficiente") });
  });

  it("acima de 365 dias vira 'mais de 365'", () => {
    expect(diasDeCaixa({ caixaAtual: reais(1_000_000), saidasNaJanela: reais(90), ...ok })).toEqual({ tipo: "dias", dias: 365, maisDe365: true });
  });

  it("nunca devolve NaN nem Infinity", () => {
    for (const caixaAtual of [0, -1, 1, reais(1e9)])
      for (const saidasNaJanela of [0, -1, 1, reais(1e9)])
        for (const diasDeHistorico of [0, 29, 30, Number.NaN]) {
          const r = diasDeCaixa({ caixaAtual, saidasNaJanela, diasDeHistorico });
          if (r.tipo === "dias") expect(Number.isFinite(r.dias)).toBe(true);
        }
  });
});

describe("impacto % do evento", () => {
  it("valor sobre o caixa antes do evento, com uma casa", () => {
    expect(impactoPercentual(reais(15_000), reais(54_500))).toBe(27.5);
  });
  it("caixa antes zerado ou negativo ⇒ null (a tela mostra —)", () => {
    expect(impactoPercentual(reais(10), 0)).toBeNull();
    expect(impactoPercentual(reais(10), reais(-1))).toBeNull();
  });
});

describe("quanto precisa entrar para não romper a reserva (acumulado por data)", () => {
  it("primeiro rompimento e total até o pior dia", () => {
    const serie = [
      { dia: dia(0), saldo: reais(63_500) },
      { dia: dia(9), saldo: reais(21_500) },
      { dia: dia(15), saldo: reais(1_500) },
      { dia: dia(19), saldo: reais(-4_500) },
      { dia: dia(25), saldo: reais(-4_500) },
    ];
    expect(necessidadeParaReserva(serie, reais(30_000))).toEqual({
      primeiro: { dia: dia(9), valor: reais(8_500) },
      total: { dia: dia(19), valor: reais(34_500) },
    });
  });
  it("sem rompimento ⇒ nada", () => {
    expect(necessidadeParaReserva([{ dia: dia(0), saldo: reais(50) }], reais(30))).toEqual({ primeiro: null, total: null });
  });
});
