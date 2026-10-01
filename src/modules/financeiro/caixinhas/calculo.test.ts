import { describe, expect, it } from "vitest";
import {
  alocado,
  linhasDoMovimento,
  motivoDeRecusa,
  reservado,
  resumoGeral,
  situacaoDaCaixinha,
  usado,
  type SaidaPendente,
} from "@/modules/financeiro/caixinhas/calculo";
import { dia, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";

describe("alocado, usado e reservado (spec §4)", () => {
  it("o alocado é a soma dos movimentos com sinal", () => {
    expect(alocado([{ valor: reais(100) }, { valor: -reais(30) }, { valor: reais(5) }])).toBe(reais(75));
  });

  it("só conta o uso realizado depois da criação e até hoje (I9)", () => {
    const saidas = [
      { valor: reais(10), dataConfirmacao: dia(-5) }, // antes de a caixinha existir
      { valor: reais(20), dataConfirmacao: dia(-1) },
      { valor: reais(30), dataConfirmacao: HOJE },
      { valor: reais(40), dataConfirmacao: dia(2) }, // data futura: ainda não é uso de hoje
      { valor: reais(50), dataConfirmacao: null },
    ];
    expect(usado(saidas, dia(-2), HOJE)).toBe(reais(50));
  });

  it("R = max(0, A − U); uso além do reservado limita em zero e é avisado", () => {
    expect(reservado(reais(40), reais(30))).toEqual({ reservado: reais(10), usoAlem: 0 });
    expect(reservado(reais(40), reais(55))).toEqual({ reservado: 0, usoAlem: reais(15) });
  });
});

const pend = (id: string, valor: number, n: number): SaidaPendente => ({ id, descricao: id, valor: reais(valor), data: dia(n) });
const base = { hoje: HOJE, alocado: reais(21_500), usado: 0, horizonteDias: 30 };

describe("situacaoDaCaixinha", () => {
  it("por compromissos: soma os do horizonte; o próximo uso é o mais perto", () => {
    const s = situacaoDaCaixinha({
      ...base,
      regra: "compromissos_ligados",
      meta: null,
      pendentes: [pend("fora", 5_000, 40), pend("b", 24_000, 4), pend("a", 1_000, 2)],
    });
    expect(s.necessidade).toBe(reais(25_000));
    expect(s.reservado).toBe(reais(21_500));
    expect(s.falta).toBe(reais(3_500));
    expect(s.percentual).toBe(86);
    expect(s.estado).toBe("falta");
    expect(s.proximoUso?.id).toBe("a");
  });

  it("vencidos entram na necessidade e vêm primeiro no próximo uso", () => {
    const s = situacaoDaCaixinha({ ...base, regra: "compromissos_ligados", meta: null, pendentes: [pend("hoje", 100, 0), pend("velho", 200, -3)] });
    expect(s.necessidade).toBe(reais(300));
    expect(s.proximoUso?.id).toBe("velho");
  });

  it("nada a pagar no horizonte: necessidade zero é completa, não sem meta", () => {
    const s = situacaoDaCaixinha({ ...base, regra: "compromissos_ligados", meta: null, pendentes: [pend("longe", 100, 90)] });
    expect(s).toMatchObject({ necessidade: 0, estado: "completa", percentual: 100, falta: 0 });
  });

  it("meta fixa: usa a meta; sem meta, sem meta definida", () => {
    const com = situacaoDaCaixinha({ ...base, regra: "meta_fixa", meta: reais(60_000), alocado: reais(30_000), pendentes: [] });
    expect(com).toMatchObject({ necessidade: reais(60_000), percentual: 50, falta: reais(30_000), estado: "falta" });
    const sem = situacaoDaCaixinha({ ...base, regra: "meta_fixa", meta: null, pendentes: [] });
    expect(sem).toMatchObject({ necessidade: null, percentual: null, falta: null, estado: "sem_meta" });
  });

  it("reservado acima da necessidade: completa, percentual limitado a 100", () => {
    const s = situacaoDaCaixinha({ ...base, regra: "meta_fixa", meta: reais(10_000), alocado: reais(12_000), pendentes: [] });
    expect(s).toMatchObject({ percentual: 100, falta: 0, estado: "completa" });
  });

  it("o uso real reduz o reservado antes de comparar com a necessidade", () => {
    const s = situacaoDaCaixinha({ ...base, regra: "meta_fixa", meta: reais(10_000), alocado: reais(8_000), usado: reais(3_000), pendentes: [] });
    expect(s.reservado).toBe(reais(5_000));
    expect(s.percentual).toBe(50);
  });
});

describe("movimentos manuais (I9)", () => {
  const atual = { alocado: reais(100), reservado: reais(40) };

  it("reservar não depende do caixa: nunca é recusado por falta dele", () => {
    expect(motivoDeRecusa({ tipo: "alocacao", valor: reais(1_000_000) }, atual)).toBeNull();
  });

  it("liberar e transferir só até o reservado agora", () => {
    expect(motivoDeRecusa({ tipo: "liberacao", valor: reais(40) }, atual)).toBeNull();
    expect(motivoDeRecusa({ tipo: "liberacao", valor: reais(41) }, atual)).toBe("Só dá para liberar o que está reservado agora.");
    expect(motivoDeRecusa({ tipo: "transferencia", valor: reais(41) }, atual)).toBe("Só dá para transferir o que está reservado agora.");
  });

  it("ajuste tem sinal e não deixa o alocado negativo", () => {
    expect(motivoDeRecusa({ tipo: "ajuste", valor: -reais(100) }, atual)).toBeNull();
    expect(motivoDeRecusa({ tipo: "ajuste", valor: -reais(101) }, atual)).toBe("O ajuste deixaria o valor alocado negativo.");
  });

  it("valor zero, fracionário ou negativo (em reservar) é recusado", () => {
    expect(motivoDeRecusa({ tipo: "alocacao", valor: 0 }, atual)).toBe("Informe um valor maior que zero.");
    expect(motivoDeRecusa({ tipo: "alocacao", valor: 10.5 }, atual)).toBe("Informe um valor maior que zero.");
    expect(motivoDeRecusa({ tipo: "alocacao", valor: -5 }, atual)).toBe("Informe um valor maior que zero.");
  });

  it("transferência = saída na origem + entrada no destino, soma zero", () => {
    const l = linhasDoMovimento({ tipo: "transferencia", valor: reais(10) }, "A", "B");
    expect(l).toEqual([
      { caixinhaId: "A", tipo: "transferencia", valor: -reais(10) },
      { caixinhaId: "B", tipo: "transferencia", valor: reais(10) },
    ]);
    expect(l.reduce((s, x) => s + x.valor, 0)).toBe(0);
    expect(() => linhasDoMovimento({ tipo: "transferencia", valor: 1 }, "A", "A")).toThrow();
    expect(() => linhasDoMovimento({ tipo: "transferencia", valor: 1 }, "A")).toThrow();
  });

  it("liberar grava valor negativo; ajustar mantém o sinal pedido", () => {
    expect(linhasDoMovimento({ tipo: "liberacao", valor: reais(5) }, "A")).toEqual([{ caixinhaId: "A", tipo: "liberacao", valor: -reais(5) }]);
    expect(linhasDoMovimento({ tipo: "ajuste", valor: -reais(5) }, "A")).toEqual([{ caixinhaId: "A", tipo: "ajuste", valor: -reais(5) }]);
  });
});

describe("resumoGeral: caixa = reservado + livre (− descoberta)", () => {
  it("exemplo do mock: 87.500 = 71.700 + 15.800", () => {
    expect(resumoGeral(reais(87_500), [reais(21_500), reais(18_000), reais(32_200)])).toEqual({
      caixa: reais(87_500),
      reservado: reais(71_700),
      livre: reais(15_800),
      descoberto: 0,
    });
  });
  it("reservado maior que o caixa: livre zero e a falta aparece como descoberta", () => {
    expect(resumoGeral(reais(100), [reais(120)])).toMatchObject({ livre: 0, descoberto: reais(20) });
  });
});
