import { describe, expect, it } from "vitest";
import { consumirCaixinha, posicao, reservadoDaCaixinha } from "@/modules/financeiro/liquidez/caixinhas";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import { congelar, dia, entradaMotor, evento, reais, saldoEm } from "@/modules/financeiro/liquidez/fixtures";

describe("caixinhas — fórmulas (spec §4)", () => {
  it("reservado nunca fica negativo; uso além do reservado é informado à parte", () => {
    expect(reservadoDaCaixinha(50, 20)).toEqual({ reservado: 30, usoAlemDoReservado: 0 });
    expect(reservadoDaCaixinha(50, 70)).toEqual({ reservado: 0, usoAlemDoReservado: 20 });
  });

  it("caixa = reservado + livre − descoberto, sempre", () => {
    for (const [caixa, reservado] of [
      [100, 40],
      [100, 100],
      [100, 120],
      [-10, 30],
      [0, 0],
    ]) {
      const p = posicao(caixa, reservado);
      expect(p.caixa).toBe(p.reservado + p.livre - p.descoberto);
      expect(p.livre).toBeGreaterThanOrEqual(0);
      expect(p.descoberto).toBeGreaterThanOrEqual(0);
    }
  });

  it("saldo 100 e reservado 120: livre 0 e R$ 20 descobertos (não some num livre zerado)", () => {
    expect(posicao(reais(100), reais(120))).toEqual({
      caixa: reais(100),
      reservado: reais(120),
      livreBruto: reais(-20),
      livre: 0,
      descoberto: reais(20),
    });
  });

  it("consumir: a caixinha cobre até o que tem; o resto é sem cobertura", () => {
    expect(consumirCaixinha(30, 40)).toEqual({ coberto: 30, semCobertura: 0, reservadoDepois: 10 });
    expect(consumirCaixinha(30, 20)).toEqual({ coberto: 20, semCobertura: 10, reservadoDepois: 0 });
    expect(consumirCaixinha(30, 0)).toEqual({ coberto: 0, semCobertura: 30, reservadoDepois: 0 });
  });
});

describe("caixinhas no motor — nenhuma dupla redução", () => {
  it("saldo 100, reservado 40, compromisso de 30 ligado: reservado vai a 10 e o livre não muda", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        caixinhas: [{ id: "k", reservado: reais(40) }],
        eventos: [evento({ id: "folha", tipo: "despesa", valor: reais(30), data: dia(1), caixinhaId: "k" })],
      }),
    );
    expect(p.hoje.livreBruto).toBe(reais(60));
    const d1 = p.serie.find((s) => s.dia === dia(1))!;
    expect(d1).toMatchObject({ saldo: reais(70), reservado: reais(10), livreBruto: reais(60) });
    expect(p.totais).toMatchObject({ compromissos: reais(30), cobertos: reais(30), semCobertura: 0 });
  });

  it("compromisso de 30 numa caixinha com 20: cobre 20, o livre cai só 10", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        caixinhas: [{ id: "k", reservado: reais(20) }],
        eventos: [evento({ id: "x", tipo: "despesa", valor: reais(30), data: dia(1), caixinhaId: "k" })],
      }),
    );
    const e = p.eventos[0];
    expect(e).toMatchObject({ coberto: reais(20), semCobertura: reais(10) });
    expect(p.fimDoHorizonte).toMatchObject({ caixa: reais(70), reservado: 0, livreBruto: reais(70) });
    expect(p.fimDoHorizonte.livreBruto - p.hoje.livreBruto).toBe(reais(-10));
  });

  it("sobra da caixinha continua reservada depois do pagamento", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        caixinhas: [{ id: "k", reservado: reais(40) }],
        eventos: [evento({ id: "x", tipo: "despesa", valor: reais(25), data: dia(1), caixinhaId: "k" })],
      }),
    );
    expect(p.fimDoHorizonte.reservado).toBe(reais(15));
  });

  it("entrada futura não reserva nada: aumenta o caixa e o livre", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        caixinhas: [{ id: "k", reservado: reais(40) }],
        eventos: [evento({ id: "cliente", tipo: "receita", valor: reais(50), data: dia(2) })],
      }),
    );
    expect(p.fimDoHorizonte).toMatchObject({ caixa: reais(150), reservado: reais(40), livreBruto: reais(110) });
  });
});

describe("alocação simulada de entrada futura (ALOCAR)", () => {
  const eventos = [evento({ id: "cliente", tipo: "receita", valor: reais(100), data: dia(2) })];
  const base = () => entradaMotor({ caixaAtual: reais(500), caixinhas: [{ id: "salarios", reservado: 0 }], eventos });

  it("entrada de R$ 100 com R$ 60 alocados: caixa +100, reservado +60, livre +40", () => {
    const sem = projetar(base());
    const entrada = congelar({ ...base(), alocacoesSimuladas: [{ eventoId: "cliente", destinos: [{ caixinhaId: "salarios", valor: reais(60) }] }] });
    const com = projetar(entrada);
    expect(com.fimDoHorizonte.caixa - com.hoje.caixa).toBe(reais(100));
    expect(com.fimDoHorizonte.reservado - com.hoje.reservado).toBe(reais(60));
    expect(com.fimDoHorizonte.livreBruto - com.hoje.livreBruto).toBe(reais(40));
    expect(sem.fimDoHorizonte.livreBruto - sem.hoje.livreBruto).toBe(reais(100));
    // A alocação não muda o caixa nem as entradas, e não toca na entrada recebida (congelada).
    expect(saldoEm(com.serie, 2)).toBe(saldoEm(sem.serie, 2));
    expect(com.totais.entradas).toBe(sem.totais.entradas);
    expect(com.totais.alocadoSimulado).toBe(reais(60));
    expect(entrada.caixinhas[0].reservado).toBe(0);
  });

  it("alocação maior que a entrada é limitada ao valor da entrada", () => {
    const p = projetar({ ...base(), alocacoesSimuladas: [{ eventoId: "cliente", destinos: [{ caixinhaId: "salarios", valor: reais(150) }] }] });
    expect(p.totais.alocadoSimulado).toBe(reais(100));
  });

  it("alocação de entrada fora do cenário não acontece", () => {
    const p = projetar({
      ...base(),
      eixos: { entradas: "confirmadas", compromissos: "todos" },
      alocacoesSimuladas: [{ eventoId: "cliente", destinos: [{ caixinhaId: "salarios", valor: reais(60) }] }],
    });
    expect(p.totais.alocadoSimulado).toBe(0);
  });
});

describe("reserva mínima × reserva de emergência (D4)", () => {
  it("nunca se somam: caixa 100, emergência 50, mínima 30 ⇒ o piso continua 30", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        reservaMinima: reais(30),
        caixinhas: [{ id: "emergencia", reservado: reais(50) }],
        eventos: [evento({ id: "x", tipo: "despesa", valor: reais(60), data: dia(1) })],
      }),
    );
    // Saldo 40: acima do piso de 30 (com soma, 80, já estaria rompido).
    expect(p.primeiroDiaAbaixoDaReserva).toBeNull();
    expect(p.margemFim).toBe(reais(10));
    expect(p.fimDoHorizonte.descoberto).toBe(reais(10));
  });
});
