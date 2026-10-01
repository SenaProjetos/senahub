import { describe, expect, it } from "vitest";
import { anomaliasDoSaldo, saldoBase, type Realizado } from "@/modules/financeiro/liquidez/saldo-base";
import { dia, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";

describe("saldoBase — caixa atual (spec §3)", () => {
  it("saldos iniciais das contas ativas + realizados por conta + realizados sem conta ou de conta inativa", () => {
    const r = saldoBase(
      [
        { id: "A", saldoInicial: reais(1000) },
        { id: "B", saldoInicial: reais(500) },
      ],
      [
        { contaId: "A", tipo: "receita", valor: reais(200) },
        { contaId: "B", tipo: "despesa", valor: reais(50) },
        { contaId: null, tipo: "receita", valor: reais(30) },
        { contaId: "inativa", tipo: "despesa", valor: reais(20) },
      ],
    );
    expect(r.porConta).toEqual({ A: reais(1200), B: reais(450) });
    expect(r.semConta).toBe(reais(10));
    expect(r.total).toBe(reais(1660));
  });

  it("sem contas e sem movimentos o caixa é zero", () => {
    expect(saldoBase([], [])).toEqual({ porConta: {}, semConta: 0, total: 0 });
  });

  it("dá o mesmo número que a conta antiga do fluxoCaixa (mesmo caixa da Visão geral)", () => {
    // Cópia literal da conta que `fluxoCaixa` fazia em reais, para provar a equivalência.
    function contaAntiga(contas: { id: string; saldoInicial: number }[], realizados: { contaId: string | null; tipo: string; valor: number }[]) {
      const saldoPorConta = new Map<string, number>();
      for (const c of contas) saldoPorConta.set(c.id, c.saldoInicial);
      let semConta = 0;
      for (const l of realizados) {
        const delta = l.tipo === "receita" ? l.valor : -l.valor;
        if (l.contaId && saldoPorConta.has(l.contaId)) saldoPorConta.set(l.contaId, saldoPorConta.get(l.contaId)! + delta);
        else semConta += delta;
      }
      return [...saldoPorConta.values()].reduce((s, v) => s + v, 0) + semConta;
    }
    let semente = 7;
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente / 2147483648;
    };
    for (let rodada = 0; rodada < 50; rodada++) {
      const contas = ["A", "B", "C"].map((id) => ({ id, saldoInicial: Math.round(aleatorio() * 1_000_000) / 100 }));
      const realizados: Realizado[] = Array.from({ length: 40 }, () => ({
        contaId: ["A", "B", "C", null, "fechada"][Math.floor(aleatorio() * 5)],
        tipo: aleatorio() < 0.5 ? "receita" : "despesa",
        valor: Math.round(aleatorio() * 500_000),
      }));
      const novo = saldoBase(
        contas.map((c) => ({ id: c.id, saldoInicial: Math.round(c.saldoInicial * 100) })),
        realizados,
      );
      const antigo = contaAntiga(contas, realizados.map((l) => ({ ...l, valor: l.valor / 100 })));
      expect(novo.total / 100).toBeCloseTo(antigo, 6);
    }
  });
});

describe("anomaliasDoSaldo — avisos, nunca correção (A1–A3)", () => {
  it("conta realizado com data futura, de conta inativa e sem conta", () => {
    const a = anomaliasDoSaldo(HOJE, new Set(["A"]), [
      { contaId: "A", tipo: "despesa", valor: reais(10), dataConfirmacao: dia(3) },
      { contaId: "fechada", tipo: "receita", valor: reais(20), dataConfirmacao: dia(-1) },
      { contaId: null, tipo: "despesa", valor: reais(5), dataConfirmacao: HOJE },
      { contaId: "A", tipo: "receita", valor: reais(99), dataConfirmacao: HOJE },
    ]);
    expect(a).toEqual({
      dataFutura: { quantidade: 1, valor: reais(10) },
      contaInativa: { quantidade: 1, valor: reais(20) },
      semConta: { quantidade: 1, valor: reais(5) },
    });
  });
});
