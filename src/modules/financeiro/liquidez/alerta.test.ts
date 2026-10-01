import { describe, expect, it } from "vitest";
import { resumoDoAlerta } from "@/modules/financeiro/liquidez/alerta";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import { dia, entradaMotor, evento, reais } from "@/modules/financeiro/liquidez/fixtures";

describe("resumo do alerta (informa, não decide)", () => {
  const eventos = [
    evento({ id: "folha", tipo: "despesa", valor: reais(24_000), data: dia(4), prioridade: "p1", naoProgramavel: "P1" }),
    evento({ id: "prolabore", tipo: "despesa", valor: reais(27_000), data: dia(5), prioridade: "p2" }),
    evento({ id: "fornecedor", tipo: "despesa", valor: reais(15_000), data: dia(9), prioridade: "p3" }),
    evento({ id: "construtora", tipo: "receita", valor: reais(18_000), data: dia(5), confianca: "confirmada_cliente" }),
    evento({ id: "litoral", tipo: "receita", valor: reais(15_000), data: dia(14), confianca: "provavel" }),
    evento({ id: "depois", tipo: "despesa", valor: reais(99_000), data: dia(25), prioridade: "p4" }),
    evento({ id: "transf", tipo: "despesa", natureza: "transferencia", valor: reais(500), data: dia(1), transferencia: { id: null, contrapartes: [] } }),
  ];

  it("sem rompimento não há alerta", () => {
    const p = projetar(entradaMotor({ caixaAtual: reais(500_000), reservaMinima: reais(30_000), eventos }));
    expect(resumoDoAlerta(p, eventos, reais(30_000))).toBeNull();
  });

  it("abaixo da reserva: data, falta, maiores saídas e entradas por confiança até a data", () => {
    // Menor saldo: 87,5 − 0,5 (transferência) − 24 + 18 − 27 − 15 = 39 mil em D+9, abaixo do piso de 40 mil.
    const p = projetar(entradaMotor({ caixaAtual: reais(87_500), reservaMinima: reais(40_000), eventos: eventos.filter((e) => e.id !== "depois") }));
    const r = resumoDoAlerta(p, eventos, reais(40_000))!;
    expect(r.tipo).toBe("reserva");
    expect(r.data).toBe(dia(9));
    expect(r.maioresSaidas.map((s) => s.id)).toEqual(["prolabore", "folha", "fornecedor"]);
    expect(r.entradasPorConfianca).toEqual({ confirmada_cliente: reais(18_000), provavel: 0, estimada: 0, incerta: 0 });
    expect(r.reprogramavelP3P4).toBe(reais(15_000));
    expect(r.falta).toBe(reais(1_000));
  });

  it("déficit tem prioridade sobre reserva e a falta é o saldo negativo", () => {
    const p = projetar(entradaMotor({ caixaAtual: reais(87_500), reservaMinima: reais(30_000), eventos }));
    const r = resumoDoAlerta(p, eventos, reais(30_000))!;
    expect(r.tipo).toBe("deficit");
    expect(r.data).toBe(dia(25));
    expect(r.falta).toBe(-p.menorSaldo.valor);
    expect(r.maioresSaidas[0].id).toBe("depois");
  });
});
