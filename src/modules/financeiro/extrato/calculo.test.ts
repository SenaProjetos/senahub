import { describe, expect, it } from "vitest";
import { conferirSaldo, montarExtrato, passaConciliacao, type MovimentoDaConta } from "@/modules/financeiro/extrato/calculo";

const m = (id: string, dia: string, tipo: "receita" | "despesa", reais: number, ordem = "0"): MovimentoDaConta => ({ id, dia, ordem, tipo, valorCentavos: Math.round(reais * 100) });

describe("montarExtrato", () => {
  const movs = [
    m("a", "2026-09-20", "receita", 1000),
    m("b", "2026-10-02", "receita", 45000),
    m("c", "2026-10-05", "despesa", 24000),
    m("d", "2026-10-15", "despesa", 10000),
    m("e", "2026-11-03", "receita", 999),
  ];
  const e = montarExtrato({ saldoInicialCentavos: 6_140_000, movimentos: movs, de: "2026-10-01", ate: "2026-10-31" });

  it("saldo anterior = inicial + o que veio antes do período", () => {
    const x = montarExtrato({ saldoInicialCentavos: 6_240_000 - 100_000, movimentos: movs, de: "2026-10-01", ate: "2026-10-31" });
    expect(x.saldoAnteriorCentavos).toBe(6_240_000);
  });
  it("entradas, saídas e saldo final fecham: anterior + entradas − saídas", () => {
    const x = montarExtrato({ saldoInicialCentavos: 6_140_000, movimentos: movs, de: "2026-10-01", ate: "2026-10-31" });
    expect(x.entradasCentavos).toBe(4_500_000);
    expect(x.saidasCentavos).toBe(3_400_000);
    expect(x.saldoFinalCentavos).toBe(x.saldoAnteriorCentavos + x.entradasCentavos - x.saidasCentavos);
    expect(x.linhas.map((l) => l.saldoCentavos)).toEqual([x.saldoAnteriorCentavos + 4_500_000, x.saldoAnteriorCentavos + 2_100_000, x.saldoAnteriorCentavos + 1_100_000]);
  });
  it("movimento depois do período não entra", () => {
    expect(e.linhas.some((l) => l.id === "e")).toBe(false);
  });
  it("mesmo dia: pela ordem de criação; sem movimento, o saldo anterior é o final", () => {
    const x = montarExtrato({ saldoInicialCentavos: 0, movimentos: [m("y", "2026-10-02", "despesa", 5, "2"), m("x", "2026-10-02", "receita", 10, "1")], de: "2026-10-01", ate: "2026-10-31" });
    expect(x.linhas.map((l) => l.id)).toEqual(["x", "y"]);
    const vazio = montarExtrato({ saldoInicialCentavos: 500, movimentos: [], de: "2026-10-01", ate: "2026-10-31" });
    expect(vazio.saldoFinalCentavos).toBe(500);
    expect(vazio.saldoAnteriorCentavos).toBe(500);
  });
  it("centavos exatos: 0,1 + 0,2 não deriva", () => {
    const x = montarExtrato({ saldoInicialCentavos: 0, movimentos: [m("a", "2026-10-01", "receita", 0.1), m("b", "2026-10-01", "receita", 0.2, "1")], de: "2026-10-01", ate: "2026-10-31" });
    expect(x.saldoFinalCentavos).toBe(30);
  });
});

describe("conferência e filtro", () => {
  it("saldo do banco × do sistema", () => {
    expect(conferirSaldo({ dia: "2026-10-31", bancoCentavos: 8_815_000, sistemaCentavos: 8_815_000 }).confere).toBe(true);
    const c = conferirSaldo({ dia: "2026-10-31", bancoCentavos: 398_000, sistemaCentavos: 410_000 });
    expect(c).toMatchObject({ confere: false, diferencaCentavos: -12_000 });
  });
  it("filtro de conciliação", () => {
    expect(passaConciliacao(true, "tudo")).toBe(true);
    expect(passaConciliacao(true, "falta")).toBe(false);
    expect(passaConciliacao(false, "falta")).toBe(true);
    expect(passaConciliacao(false, "conciliado")).toBe(false);
  });
});
