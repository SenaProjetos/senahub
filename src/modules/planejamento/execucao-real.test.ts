import { describe, expect, it } from "vitest";
import { DIAS_UTEIS_PADRAO, type Calendario } from "@/lib/calendario-trabalho";
import {
  custoRealDaFolha,
  diasDeVariacao,
  duracaoReal,
  duracaoRestante,
  somaNaArvore,
  trabalhoRealDaFolha,
  type ValorReal,
} from "./execucao-real";

const cal: Calendario = { diasSemana: DIAS_UTEIS_PADRAO, feriados: new Set() };
// Quarta-feira.
const hoje = "2026-11-04";

describe("duracaoReal", () => {
  it("em andamento: do início real até hoje, em dias úteis", () => {
    expect(duracaoReal({ marco: false, inicioReal: "2026-11-02", fimReal: null, hoje }, cal)).toBe(3);
  });
  it("concluída: do início ao término real", () => {
    expect(duracaoReal({ marco: false, inicioReal: "2026-11-02", fimReal: "2026-11-03", hoje }, cal)).toBe(2);
  });
  it("sem início real ou marco: não se mede", () => {
    expect(duracaoReal({ marco: false, inicioReal: null, fimReal: null, hoje }, cal)).toBeNull();
    expect(duracaoReal({ marco: true, inicioReal: "2026-11-02", fimReal: "2026-11-02", hoje }, cal)).toBeNull();
  });
});

describe("duracaoRestante", () => {
  const base = { marco: false, status: "and" as const, progresso: 40, fimPrevisto: "2026-11-06", hoje };
  it("de hoje até o término previsto, em dias úteis", () => {
    expect(duracaoRestante(base, cal)).toBe(3);
  });
  it("concluída ou 100%: nada resta", () => {
    expect(duracaoRestante({ ...base, status: "con", progresso: 100 }, cal)).toBe(0);
    expect(duracaoRestante({ ...base, progresso: 100 }, cal)).toBe(0);
  });
  it("tarefa que ainda não começa: conta do início previsto, não de hoje", () => {
    expect(duracaoRestante({ ...base, progresso: 0, inicioPrevisto: "2026-11-09", fimPrevisto: "2026-11-13" }, cal)).toBe(5);
  });
  it("data real com ano errado não derruba a conta", () => {
    expect(duracaoReal({ marco: false, inicioReal: "2001-01-02", fimReal: null, hoje }, cal)).toBeNull();
  });
  it("término previsto já passou: 0 (a tela pinta de vermelho)", () => {
    expect(duracaoRestante({ ...base, fimPrevisto: "2026-11-03" }, cal)).toBe(0);
  });
  it("marco e linha fora da execução: não se mede", () => {
    expect(duracaoRestante({ ...base, marco: true }, cal)).toBeNull();
    expect(duracaoRestante({ ...base, status: "can" }, cal)).toBeNull();
  });
});

describe("custoRealDaFolha", () => {
  const taxas = new Map([
    ["u1", 100],
    ["u2", 50],
  ]);
  const interna = (minutos: [string, number][], custoRealTerceiro: number | null = null) =>
    custoRealDaFolha({ deTerceiro: false, custoRealTerceiro, minutosPorPessoa: new Map(minutos), custoHora: taxas });

  it("interna: horas apontadas × custo/hora de cada pessoa", () => {
    expect(interna([["u1", 90], ["u2", 30]])).toEqual({ valor: 175, parcial: false });
  });
  it("quem apontou sem custo/hora deixa parcial e não some com o resto", () => {
    expect(interna([["u1", 90], ["u2", 30], ["u3", 60]])).toEqual({ valor: 175, parcial: true });
  });
  it("sem apontamento: zero conhecido", () => {
    expect(interna([])).toEqual({ valor: 0, parcial: false });
  });
  it("interna ignora sobra de valor de terceiro e soma só as horas", () => {
    expect(interna([["u1", 90], ["u2", 30]], 999)).toEqual({ valor: 175, parcial: false });
  });
  it("terceiro: o valor digitado, ignorando minutos e taxas", () => {
    const terceiro = (v: number | null) =>
      custoRealDaFolha({ deTerceiro: true, custoRealTerceiro: v, minutosPorPessoa: new Map([["u1", 600]]), custoHora: taxas });
    expect(terceiro(1250.5)).toEqual({ valor: 1250.5, parcial: false });
    expect(terceiro(null)).toEqual({ valor: null, parcial: false });
  });
});

describe("trabalhoRealDaFolha", () => {
  it("horas com uma casa", () => {
    expect(trabalhoRealDaFolha({ deTerceiro: false, minutos: 125 })).toEqual({ valor: 2.1, parcial: false });
  });
  it("terceiro não se mede pelo ponto", () => {
    expect(trabalhoRealDaFolha({ deTerceiro: true, minutos: 125 })).toEqual({ valor: null, parcial: false });
  });
});

describe("somaNaArvore", () => {
  const linhas = [
    { id: "R", parentId: null },
    { id: "A", parentId: "R" },
    { id: "B", parentId: "R" },
    { id: "S", parentId: "R" },
    { id: "C", parentId: "S" },
  ];
  const folhas = new Map<string, ValorReal>([
    ["A", { valor: 10, parcial: false }],
    ["B", { valor: null, parcial: false }],
    ["C", { valor: 2.5, parcial: true }],
  ]);

  it("agrupamento soma os filhos com valor e herda o parcial", () => {
    const r = somaNaArvore(linhas, folhas);
    expect(r.get("S")).toEqual({ valor: 2.5, parcial: true });
    expect(r.get("R")).toEqual({ valor: 12.5, parcial: true });
    expect(r.get("A")).toEqual({ valor: 10, parcial: false });
  });
  it("agrupamento só com filhos sem valor: não se mede", () => {
    const r = somaNaArvore([{ id: "P", parentId: null }, { id: "X", parentId: "P" }], new Map([["X", { valor: null, parcial: false }]]));
    expect(r.get("P")).toEqual({ valor: null, parcial: false });
  });
  it("ciclo de parentId termina", () => {
    const r = somaNaArvore(
      [
        { id: "M", parentId: "N" },
        { id: "N", parentId: "M" },
      ],
      new Map(),
    );
    expect(r.size).toBe(2);
  });
});

describe("diasDeVariacao", () => {
  it("positivo = depois da base; negativo = antes", () => {
    expect(diasDeVariacao("2026-11-02", "2026-11-05")).toBe(3);
    expect(diasDeVariacao("2026-11-05", "2026-11-02")).toBe(-3);
  });
  it("sem base ou sem data atual: não se mede", () => {
    expect(diasDeVariacao(null, "2026-11-05")).toBeNull();
    expect(diasDeVariacao("2026-11-02", "")).toBeNull();
  });
});
