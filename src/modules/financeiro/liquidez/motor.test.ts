import { describe, expect, it } from "vitest";
import { normalizarHorizonte, projetar } from "@/modules/financeiro/liquidez/motor";

describe("normalizarHorizonte", () => {
  it("prende entre 7 e 180, trunca, e cai no padrão quando não é número finito", () => {
    expect(normalizarHorizonte(30, 60)).toBe(30);
    expect(normalizarHorizonte(3, 30)).toBe(7);
    expect(normalizarHorizonte(400, 30)).toBe(180);
    expect(normalizarHorizonte(45.9, 30)).toBe(45);
    expect(normalizarHorizonte(Number.NaN, 90)).toBe(90);
    expect(normalizarHorizonte(Number.POSITIVE_INFINITY, 60)).toBe(60);
    expect(normalizarHorizonte(undefined, 30)).toBe(30);
    expect(normalizarHorizonte("90", 30)).toBe(30);
  });
});
import { congelar, dia, entradaMotor, evento, HOJE, reais, saldoEm } from "@/modules/financeiro/liquidez/fixtures";

describe("motor — modelo mental (spec §16)", () => {
  // Exemplo do dono: caixa 100 mil, 40 mil em caixinha, +43 mil de entradas, −72 mil de compromissos
  // (30 mil deles saindo da caixinha), reserva mínima 30 mil.
  const p = projetar(
    entradaMotor({
      caixaAtual: reais(100_000),
      reservaMinima: reais(30_000),
      caixinhas: [{ id: "salarios", reservado: reais(40_000) }],
      eventos: [
        evento({ id: "folha", tipo: "despesa", valor: reais(30_000), data: dia(4), caixinhaId: "salarios", prioridade: "p1" }),
        evento({ id: "fornecedor", tipo: "despesa", valor: reais(42_000), data: dia(9) }),
        evento({ id: "cliente", tipo: "receita", valor: reais(43_000), data: dia(14) }),
      ],
    }),
  );

  it("hoje: caixa − reservado = livre", () => {
    expect(p.hoje).toEqual({ caixa: reais(100_000), reservado: reais(40_000), livreBruto: reais(60_000), livre: reais(60_000), descoberto: 0 });
  });

  it("projeção: saldo = caixa + entradas − compromissos, e margem até a reserva", () => {
    expect(p.totais.entradas).toBe(reais(43_000));
    expect(p.totais.compromissos).toBe(reais(72_000));
    expect(p.fimDoHorizonte.caixa).toBe(reais(71_000));
    expect(p.margemFim).toBe(reais(41_000));
  });

  it("compromisso coberto pela caixinha já está dentro dos compromissos: não sai de novo do livre", () => {
    expect(p.totais.cobertos).toBe(reais(30_000));
    expect(p.totais.semCobertura).toBe(reais(42_000));
    expect(p.fimDoHorizonte.reservado).toBe(reais(10_000));
    // L*_H = L*_0 + E − C_sem = 60 + 43 − 42
    expect(p.fimDoHorizonte.livreBruto).toBe(reais(61_000));
  });

  it("identidades do fim do horizonte", () => {
    const { entradas: E, compromissos: C, cobertos, semCobertura, transferencias: T, alocadoSimulado: A } = p.totais;
    expect(p.fimDoHorizonte.caixa).toBe(p.hoje.caixa + E - C + T);
    expect(p.fimDoHorizonte.reservado).toBe(p.hoje.reservado - cobertos + A);
    expect(p.fimDoHorizonte.livreBruto).toBe(p.hoje.livreBruto + E - semCobertura + T - A);
  });
});

describe("motor — dias (spec §3)", () => {
  it("pendente de hoje entra no fechamento de hoje; dias seguintes, um a um", () => {
    const p = projetar(entradaMotor({ eventos: [evento({ id: "hoje", tipo: "despesa", valor: reais(10), data: HOJE })] }));
    expect(p.serie[0].dia).toBe(HOJE);
    expect(p.serie[0].saldo).toBe(reais(90));
    expect(p.serie).toHaveLength(30);
    expect(p.fim).toBe(dia(29));
  });

  it("vencido entra no início de hoje, antes dos eventos de hoje", () => {
    const p = projetar(
      entradaMotor({
        eventos: [
          evento({ id: "de-hoje", tipo: "despesa", valor: reais(20), data: HOJE }),
          evento({ id: "vencido", tipo: "despesa", valor: reais(10), data: dia(-3) }),
        ],
      }),
    );
    const vencido = p.eventos.find((e) => e.id === "vencido")!;
    const deHoje = p.eventos.find((e) => e.id === "de-hoje")!;
    expect(vencido.dia).toBe(HOJE);
    expect(vencido.caixaAntes).toBe(reais(100));
    expect(deHoje.caixaAntes).toBe(reais(90));
    expect(saldoEm(p.serie, 0)).toBe(reais(70));
  });

  it("no mesmo dia, saídas antes de entradas no caixa antes/depois; o fechamento não depende da ordem", () => {
    const p = projetar(
      entradaMotor({
        eventos: [
          evento({ id: "entra", tipo: "receita", valor: reais(50), data: dia(2) }),
          evento({ id: "sai", tipo: "despesa", valor: reais(80), data: dia(2) }),
        ],
      }),
    );
    expect(p.eventos.find((e) => e.id === "sai")!.caixaAntes).toBe(reais(100));
    expect(p.eventos.find((e) => e.id === "entra")!.caixaAntes).toBe(reais(20));
    expect(saldoEm(p.serie, 2)).toBe(reais(70));
  });

  it("evento depois do horizonte não entra", () => {
    const p = projetar(entradaMotor({ horizonteDias: 30, eventos: [evento({ id: "longe", tipo: "despesa", valor: reais(10), data: dia(30) })] }));
    const e = p.eventos[0];
    expect(e.foraDoHorizonte).toBe(true);
    expect(e.aplicado).toBe(false);
    expect(p.fimDoHorizonte.caixa).toBe(reais(100));
  });

  it("recusa horizonte fora de 7 a 180 dias", () => {
    expect(() => projetar(entradaMotor({ horizonteDias: 6 }))).toThrow();
    expect(() => projetar(entradaMotor({ horizonteDias: 181 }))).toThrow();
    expect(() => projetar(entradaMotor({ horizonteDias: 180 }))).not.toThrow();
  });
});

describe("motor — eixos do cenário", () => {
  const eventos = [
    evento({ id: "conf", tipo: "receita", valor: reais(10), data: dia(1), confianca: "confirmada_cliente" }),
    evento({ id: "prov", tipo: "receita", valor: reais(20), data: dia(1), confianca: "provavel" }),
    evento({ id: "est", tipo: "receita", valor: reais(40), data: dia(1), confianca: "estimada" }),
    evento({ id: "inc", tipo: "receita", valor: reais(80), data: dia(1), confianca: "incerta" }),
    evento({ id: "p1", tipo: "despesa", valor: reais(1), data: dia(1), prioridade: "p1" }),
    evento({ id: "p2", tipo: "despesa", valor: reais(2), data: dia(1), prioridade: "p2" }),
    evento({ id: "p3", tipo: "despesa", valor: reais(4), data: dia(1), prioridade: "p3" }),
  ];
  const E = (entradas: "confirmadas" | "provaveis" | "estimadas" | "todas") =>
    projetar(entradaMotor({ eventos, eixos: { entradas, compromissos: "todos" } })).totais.entradas;
  const C = (compromissos: "todos" | "p1p2" | "p1") =>
    projetar(entradaMotor({ eventos, eixos: { entradas: "provaveis", compromissos } })).totais.compromissos;

  it("entradas acumulam por confiança", () => {
    expect(E("confirmadas")).toBe(reais(10));
    expect(E("provaveis")).toBe(reais(30));
    expect(E("estimadas")).toBe(reais(70));
    expect(E("todas")).toBe(reais(150));
  });

  it("compromissos filtram por prioridade", () => {
    expect(C("todos")).toBe(reais(7));
    expect(C("p1p2")).toBe(reais(3));
    expect(C("p1")).toBe(reais(1));
  });

  it("evento fora do cenário fica marcado e não mexe no saldo", () => {
    const p = projetar(entradaMotor({ eventos, eixos: { entradas: "confirmadas", compromissos: "p1" } }));
    expect(p.eventos.find((e) => e.id === "prov")).toMatchObject({ noCenario: false, aplicado: false, dia: null });
  });
});

describe("motor — conservação: pagar ou reprogramar não conta o dinheiro duas vezes (spec §5)", () => {
  const S = reais(100);
  const v = reais(30);

  it("a) antecipado: pendente em D+3 pago hoje", () => {
    const antes = projetar(entradaMotor({ caixaAtual: S, eventos: [evento({ id: "x", tipo: "despesa", valor: v, data: dia(3) })] }));
    const depois = projetar(entradaMotor({ caixaAtual: S - v, eventos: [] }));
    expect(depois.fimDoHorizonte.caixa).toBe(antes.fimDoHorizonte.caixa);
    for (const n of [0, 1, 2]) expect(saldoEm(depois.serie, n)).toBe(saldoEm(antes.serie, n) - v);
    expect(saldoEm(depois.serie, 3)).toBe(saldoEm(antes.serie, 3));
  });

  it("b) reprogramação: pendente em D+1 movido para D+6", () => {
    const antes = projetar(entradaMotor({ caixaAtual: S, eventos: [evento({ id: "x", tipo: "despesa", valor: v, data: dia(1) })] }));
    const depois = projetar(entradaMotor({ caixaAtual: S, eventos: [evento({ id: "x", tipo: "despesa", valor: v, data: dia(6) })] }));
    expect(depois.fimDoHorizonte.caixa).toBe(antes.fimDoHorizonte.caixa);
    for (const n of [1, 2, 3, 4, 5]) expect(saldoEm(depois.serie, n)).toBe(saldoEm(antes.serie, n) + v);
    expect(depois.totais.compromissos).toBe(v);
    expect(depois.eventos.filter((e) => e.aplicado)).toHaveLength(1);
  });

  it("c) vencimento: pendente em D−3 pago hoje", () => {
    const antes = projetar(entradaMotor({ caixaAtual: S, eventos: [evento({ id: "x", tipo: "despesa", valor: v, data: dia(-3) })] }));
    const depois = projetar(entradaMotor({ caixaAtual: S - v, eventos: [] }));
    expect(saldoEm(depois.serie, 0)).toBe(saldoEm(antes.serie, 0));
    expect(depois.fimDoHorizonte.caixa).toBe(antes.fimDoHorizonte.caixa);
    expect(antes.totais.compromissos).toBe(v);
  });

  it("d) realizado sem pendente só existe no caixa atual", () => {
    const p = projetar(entradaMotor({ caixaAtual: S - v, eventos: [] }));
    expect(p.eventos).toHaveLength(0);
    expect(p.fimDoHorizonte.caixa).toBe(S - v);
  });

  it("e) parcial: pago 40 de 100 em D+2; o resto continua pendente na mesma data", () => {
    const antes = projetar(entradaMotor({ caixaAtual: reais(500), eventos: [evento({ id: "x", tipo: "despesa", valor: reais(100), data: dia(2) })] }));
    const depois = projetar(
      entradaMotor({ caixaAtual: reais(460), eventos: [evento({ id: "resto", tipo: "despesa", valor: reais(60), data: dia(2) })] }),
    );
    expect(depois.fimDoHorizonte.caixa).toBe(antes.fimDoHorizonte.caixa);
    expect(saldoEm(depois.serie, 2)).toBe(saldoEm(antes.serie, 2));
  });
});

describe("motor — determinismo e pureza", () => {
  const eventos = [
    evento({ id: "a", tipo: "despesa", valor: reais(30), data: dia(3), caixinhaId: "k" }),
    evento({ id: "b", tipo: "receita", valor: reais(50), data: dia(3) }),
    evento({ id: "c", tipo: "despesa", valor: reais(10), data: dia(-2) }),
    evento({ id: "d", tipo: "despesa", valor: reais(5), data: dia(3) }),
  ];

  it("não muta a entrada (tudo congelado) e dá o mesmo resultado em toda execução", () => {
    const e = congelar(entradaMotor({ eventos, caixinhas: [{ id: "k", reservado: reais(20) }] }));
    const r1 = JSON.stringify(projetar(e));
    const r2 = JSON.stringify(projetar(e));
    expect(r1).toBe(r2);
  });

  it("a ordem dos eventos na entrada não muda saldos nem totais", () => {
    const base = projetar(entradaMotor({ eventos }));
    const invertido = projetar(entradaMotor({ eventos: [...eventos].reverse() }));
    expect(invertido.serie).toEqual(base.serie);
    expect(invertido.totais).toEqual(base.totais);
  });

  it("evento repetido é recusado (nada é contado duas vezes)", () => {
    expect(() => projetar(entradaMotor({ eventos: [eventos[0], eventos[0]] }))).toThrow(/duplicado/);
  });
});

describe("motor — reserva, déficit e o que dá para reprogramar", () => {
  it("rompimento da reserva, déficit, necessidade acumulada e P3/P4 programáveis até a data", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: reais(100),
        reservaMinima: reais(30),
        eventos: [
          evento({ id: "p3", tipo: "despesa", valor: reais(80), data: dia(2), prioridade: "p3" }),
          evento({ id: "p1", tipo: "despesa", valor: reais(40), data: dia(5), prioridade: "p1", naoProgramavel: "P1" }),
          evento({ id: "p4-travado", tipo: "despesa", valor: reais(7), data: dia(1), prioridade: "p4", naoProgramavel: "ART" }),
        ],
      }),
    );
    expect(p.primeiroDiaAbaixoDaReserva).toBe(dia(2));
    expect(p.primeiroDiaNegativo).toBe(dia(5));
    expect(p.menorSaldo).toEqual({ valor: reais(-27), dia: dia(5) });
    expect(p.necessidade.primeiro).toEqual({ dia: dia(2), valor: reais(17) });
    expect(p.necessidade.total).toEqual({ dia: dia(5), valor: reais(57) });
    expect(p.margemPiorDia).toBe(reais(-57));
    expect(p.reprogramavelP3P4).toBe(reais(80));
  });

  it("sem rompimento não há necessidade nem total reprogramável", () => {
    const p = projetar(entradaMotor({ eventos: [evento({ id: "x", tipo: "despesa", valor: reais(10), data: dia(1) })] }));
    expect(p.necessidade).toEqual({ primeiro: null, total: null });
    expect(p.reprogramavelP3P4).toBe(0);
  });
});
