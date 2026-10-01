import { describe, expect, it } from "vitest";
import { agruparLinhas, serieDiaria, totaisDoFluxo, type MovimentoRealizado } from "@/modules/financeiro/caixa/diario";
import { dia, entradaMotor, evento, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";
import { projetar } from "@/modules/financeiro/liquidez/motor";

/** HOJE = 2026-10-01 (quinta). Caixa de hoje = 80.000. */
const CAIXA = reais(80_000);

const REALIZADOS: MovimentoRealizado[] = [
  { data: dia(-6), tipo: "receita", valor: reais(12_000), descricao: "Hospital Regional, parcela" },
  { data: dia(-6), tipo: "despesa", valor: reais(1_800), descricao: "Energia e internet" },
  { data: dia(-2), tipo: "despesa", valor: reais(8_000), descricao: "Aluguel" },
];

function projecao(eventos = [
  evento({ id: "folha", tipo: "despesa", valor: reais(24_000), data: dia(4), prioridade: "p1", descricao: "Salários da folha" }),
  evento({ id: "cliente", tipo: "receita", valor: reais(18_000), data: dia(5), confianca: "provavel", descricao: "Construtora Horizonte" }),
]) {
  return projetar(entradaMotor({ hoje: HOJE, horizonteDias: 10, caixaAtual: CAIXA, reservaMinima: reais(30_000), eventos }));
}

function serie(opcoes: Partial<Parameters<typeof serieDiaria>[0]> = {}) {
  const p = projecao();
  return serieDiaria({
    hoje: HOJE,
    de: dia(-7),
    ate: dia(9),
    caixaAtual: CAIXA,
    realizados: REALIZADOS,
    serie: p.serie,
    ...opcoes,
  });
}

describe("série diária", () => {
  it("um item por dia do intervalo, com a metade certa de cada lado de hoje", () => {
    const s = serie();
    expect(s).toHaveLength(17);
    expect(s[0].dia).toBe(dia(-7));
    expect(s.at(-1)!.dia).toBe(dia(9));
    expect(s.filter((l) => l.tipo === "realizado").map((l) => l.dia)).toEqual([
      dia(-7), dia(-6), dia(-5), dia(-4), dia(-3), dia(-2), dia(-1),
    ]);
    expect(s.find((l) => l.dia === HOJE)!.tipo).toBe("previsto");
  });

  it("o acumulado encosta no caixa de hoje nos dois lados", () => {
    const s = serie();
    // Véspera = caixa de hoje (nada foi realizado hoje nestes dados).
    expect(s.find((l) => l.dia === dia(-1))!.acumulado).toBe(CAIXA);
    // Antes do aluguel de 8.000, o saldo era 8.000 maior.
    expect(s.find((l) => l.dia === dia(-3))!.acumulado).toBe(CAIXA + reais(8_000));
    // Antes das duas movimentações de D−6: 80.000 + 8.000 − 12.000 + 1.800.
    expect(s.find((l) => l.dia === dia(-7))!.acumulado).toBe(CAIXA + reais(8_000) - reais(12_000) + reais(1_800));
    // Futuro = o saldo do motor, sem segunda conta.
    expect(s.find((l) => l.dia === dia(4))!.acumulado).toBe(CAIXA - reais(24_000));
    expect(s.at(-1)!.acumulado).toBe(CAIXA - reais(24_000) + reais(18_000));
  });

  it("entradas, saídas e o maior movimento do dia", () => {
    const d = serie().find((l) => l.dia === dia(-6))!;
    expect(d.entradas).toBe(reais(12_000));
    expect(d.saidas).toBe(reais(1_800));
    expect(d.saldoDia).toBe(reais(10_200));
    expect(d.maior).toBe("Hospital Regional, parcela");
  });

  it("dia sem movimento fica na série, com zero e saldo mantido", () => {
    const d = serie().find((l) => l.dia === dia(-5))!;
    expect([d.entradas, d.saidas, d.saldoDia]).toEqual([0, 0, 0]);
    expect(d.acumulado).toBe(CAIXA + reais(8_000));
    expect(d.maior).toBeNull();
  });

  it("movimento fora da janela não entra", () => {
    const s = serie({ realizados: [...REALIZADOS, { data: dia(-40), tipo: "receita", valor: reais(99_000), descricao: "antigo" }] });
    expect(s.find((l) => l.dia === dia(-7))!.acumulado).toBe(CAIXA + reais(8_000) - reais(12_000) + reais(1_800));
  });

  it("a descrição do maior previsto vem do chamador", () => {
    const s = serie({ maiorPrevisto: new Map([[dia(4), "Salários da folha"]]) });
    expect(s.find((l) => l.dia === dia(4))!.maior).toBe("Salários da folha");
  });
});

describe("agrupamento", () => {
  it("por dia devolve a mesma série", () => {
    const s = serie();
    expect(agruparLinhas(s, "dia")).toEqual(s);
  });

  it("por semana soma os movimentos e mantém o saldo do último dia", () => {
    const s = serie();
    const semanas = agruparLinhas(s, "semana");
    expect(semanas.length).toBeGreaterThan(1);
    for (const g of semanas) {
      const diasDoGrupo = s.filter((l) => l.dia >= g.dia && l.dia <= (semanas[semanas.indexOf(g) + 1]?.dia ?? "9999-12-31"));
      expect(g.acumulado).toBe(diasDoGrupo.filter((l) => l.dia < (semanas[semanas.indexOf(g) + 1]?.dia ?? "9999-12-31")).at(-1)!.acumulado);
    }
    expect(semanas.reduce((t, g) => t + g.entradas, 0)).toBe(s.reduce((t, l) => t + l.entradas, 0));
    expect(semanas[0].rotulo).toMatch(/\d\d\/\d\d a \d\d\/\d\d/);
  });

  it("semana começa na segunda-feira", () => {
    const s = serie();
    // 2026-10-01 é quinta; a semana dela começa em 28/09 (segunda).
    expect(agruparLinhas(s, "semana").map((g) => g.dia)).toContain("2026-09-28");
  });

  it("grupo que encosta no futuro é previsto", () => {
    const g = agruparLinhas(serie(), "semana").find((x) => x.dia === "2026-09-28")!;
    expect(g.tipo).toBe("previsto");
  });

  it("por mês usa o rótulo MM/AAAA e fecha com o saldo do fim do mês", () => {
    const s = serie();
    const meses = agruparLinhas(s, "mes");
    expect(meses.map((m) => m.rotulo)).toEqual(["09/2026", "10/2026"]);
    expect(meses.at(-1)!.acumulado).toBe(s.at(-1)!.acumulado);
  });
});

describe("totais do fluxo", () => {
  it("separa realizado de previsto, com o intervalo de cada metade", () => {
    const t = totaisDoFluxo(serie());
    expect(t.realizado.entradas).toBe(reais(12_000));
    expect(t.realizado.saidas).toBe(reais(9_800));
    expect(t.realizado.de).toBe(dia(-7));
    expect(t.realizado.ate).toBe(dia(-1));
    expect(t.previsto.entradas).toBe(reais(18_000));
    expect(t.previsto.saidas).toBe(reais(24_000));
    expect(t.previsto.de).toBe(HOJE);
  });

  it("sem nada realizado, a metade fica zerada e sem intervalo", () => {
    const t = totaisDoFluxo(serie({ de: HOJE, realizados: [] }));
    expect(t.realizado).toEqual({ entradas: 0, saidas: 0, de: null, ate: null });
  });
});
