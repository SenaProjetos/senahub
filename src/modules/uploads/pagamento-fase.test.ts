import { describe, expect, it } from "vitest";
import {
  bloqueioValorEmModoFase,
  modoPagamento,
  poolsDasFasesPendentes,
  rotuloDisciplinaPagamento,
  writeBackFase,
  type FaseParaPagamento,
} from "./pagamento-fase";

const fase = (id: string, percentual: number, ordem: number, extra: Partial<FaseParaPagamento> = {}): FaseParaPagamento => ({
  id,
  ordem,
  percentual,
  liberadaEm: null,
  valorPagamento: null,
  ...extra,
});

/** Libera uma fase: calcula o pool dela pela regra e congela. Devolve as fases atualizadas. */
function liberar(V: number, fases: FaseParaPagamento[], id: string): FaseParaPagamento[] {
  const r = poolsDasFasesPendentes(V, fases);
  if (!r.ok) throw new Error(r.motivo);
  const pool = r.pools.get(id);
  if (pool == null) throw new Error(`fase ${id} não pendente`);
  return fases.map((f) => (f.id === id ? { ...f, liberadaEm: "2026-10-01", valorPagamento: pool } : f));
}
const somaPools = (fases: FaseParaPagamento[]) => Math.round(fases.reduce((s, f) => s + (f.valorPagamento ?? 0), 0) * 100) / 100;

describe("modoPagamento", () => {
  it("nada liberado = indefinido", () => {
    expect(modoPagamento([], [{ liberadaEm: null }])).toBe("indefinido");
  });
  it("pagamento vivo sem fase = disciplina inteira", () => {
    expect(modoPagamento([{ etapaId: null, status: "pendente" }], [{ liberadaEm: null }])).toBe("disciplina");
  });
  it("pagamento com fase ou fase liberada = por fase", () => {
    expect(modoPagamento([{ etapaId: "e1", status: "pago" }], [])).toBe("fase");
    expect(modoPagamento([], [{ liberadaEm: "2026-10-01" }])).toBe("fase");
  });
  it("pagamento inteiro CANCELADO não fixa o modo", () => {
    expect(modoPagamento([{ etapaId: null, status: "cancelado" }], [{ liberadaEm: null }])).toBe("indefinido");
  });
});

describe("poolsDasFasesPendentes — a regra do que falta", () => {
  it("sem nada liberado, é o valor × percentual; a última absorve o centavo", () => {
    const r = poolsDasFasesPendentes(1000, [fase("bs", 33.33, 0), fase("ex", 33.33, 1), fase("ab", 33.34, 2)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.pools.values()]).toEqual([333.3, 333.3, 333.4]);
  });

  it("recusa percentuais que não somam 100, dizendo onde ajustar", () => {
    const r = poolsDasFasesPendentes(1000, [fase("bs", 40, 0), fase("ex", 50, 1)]);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/somam 90%.*Etapas/) });
  });

  it("recusa valor menor que o já liberado", () => {
    const r = poolsDasFasesPendentes(300, [fase("bs", 40, 0, { liberadaEm: "x", valorPagamento: 400 }), fase("ex", 60, 1)]);
    expect(r.ok).toBe(false);
  });

  it("fase de 0% recebe 0 — plano legítimo (a fase é só cronograma)", () => {
    const r = poolsDasFasesPendentes(1000, [fase("bs", 0, 0), fase("ex", 100, 1)]);
    if (!r.ok) throw new Error();
    expect(r.pools.get("bs")).toBe(0);
    expect(r.pools.get("ex")).toBe(1000);
  });

  it("pendentes todas de 0% com resto positivo: a última pendente absorve (a soma tem de fechar)", () => {
    const r = poolsDasFasesPendentes(1200, [fase("bs", 100, 0, { liberadaEm: "x", valorPagamento: 1000 }), fase("ex", 0, 1)]);
    if (!r.ok) throw new Error();
    expect(r.pools.get("ex")).toBe(200);
  });

  it("valor grande não perde precisão (BigInt)", () => {
    const r = poolsDasFasesPendentes(98765432.1, [fase("a", 12.34, 0), fase("b", 87.66, 1)]);
    if (!r.ok) throw new Error();
    expect(Math.round(([...r.pools.values()].reduce((s, v) => s + v, 0)) * 100)).toBe(9876543210);
  });
});

describe("invariante: depois da última liberação, soma dos pools = valor da disciplina", () => {
  const base = () => [fase("bs", 40, 0), fase("ex", 35, 1), fase("ab", 25, 2)];

  it("em ordem", () => {
    let f = base();
    for (const id of ["bs", "ex", "ab"]) f = liberar(10000, f, id);
    expect(somaPools(f)).toBe(10000);
    expect(f.map((x) => x.valorPagamento)).toEqual([4000, 3500, 2500]);
  });

  it("fora de ordem — e cada fase recebe o mesmo que receberia em ordem", () => {
    let f = base();
    for (const id of ["ab", "bs", "ex"]) f = liberar(10000, f, id);
    expect(somaPools(f)).toBe(10000);
    expect(f.map((x) => x.valorPagamento)).toEqual([4000, 3500, 2500]);
  });

  it("valor muda ENTRE liberações: fechou no valor final, e a fase liberada não mexeu", () => {
    let f = liberar(10000, base(), "bs"); // Básico congela em 4000
    f = liberar(12000, f, "ex"); // o que falta (8000) reparte 35:25 → 4666,67
    f = liberar(12000, f, "ab");
    expect(f[0].valorPagamento).toBe(4000);
    expect(somaPools(f)).toBe(12000);
  });

  it("valores com dízima em qualquer ordem fecham no centavo", () => {
    for (const ordem of [["a", "b", "c"], ["c", "a", "b"], ["b", "c", "a"]]) {
      let f = [fase("a", 33.33, 0), fase("b", 33.33, 1), fase("c", 33.34, 2)];
      for (const id of ordem) f = liberar(1000.01, f, id);
      expect(somaPools(f)).toBe(1000.01);
    }
  });

  it("ajuste manual numa fase liberada NÃO vaza para as seguintes", () => {
    let f = liberar(10000, base(), "bs"); // Básico 4000
    // Produção: +500 no Básico (acréscimo negociado).
    const wb = writeBackFase({ valorDisciplina: 10000, poolFaseAntes: 4000, somaVivosFase: 4500 });
    expect(wb).toEqual({ valorDisciplina: 10500, poolFase: 4500 });
    f = f.map((x) => (x.id === "bs" ? { ...x, valorPagamento: wb.poolFase } : x));
    f = liberar(wb.valorDisciplina, f, "ex");
    f = liberar(wb.valorDisciplina, f, "ab");
    // Executivo e As-built recebem o mesmo que antes do ajuste.
    expect(f.map((x) => x.valorPagamento)).toEqual([4500, 3500, 2500]);
    expect(somaPools(f)).toBe(10500);
  });

  it("estorno (diferença negativa) também anda o total e deixa as seguintes intactas", () => {
    let f = liberar(10000, base(), "bs");
    const wb = writeBackFase({ valorDisciplina: 10000, poolFaseAntes: 4000, somaVivosFase: 0 });
    expect(wb).toEqual({ valorDisciplina: 6000, poolFase: 0 });
    f = f.map((x) => (x.id === "bs" ? { ...x, valorPagamento: 0 } : x));
    f = liberar(wb.valorDisciplina, f, "ex");
    f = liberar(wb.valorDisciplina, f, "ab");
    expect(f.map((x) => x.valorPagamento)).toEqual([0, 3500, 2500]);
  });
});

describe("bloqueioValorEmModoFase", () => {
  it("com fase pendente, pode mudar — desde que não fique abaixo do já liberado", () => {
    const f = [fase("bs", 40, 0, { liberadaEm: "x", valorPagamento: 4000 }), fase("ex", 60, 1)];
    expect(bloqueioValorEmModoFase(12000, f)).toBeNull();
    expect(bloqueioValorEmModoFase(3999.99, f)).toMatch(/abaixo do já liberado/);
  });

  it("todas liberadas: só o mesmo total passa; qualquer mudança vai para a Produção", () => {
    const f = [fase("bs", 40, 0, { liberadaEm: "x", valorPagamento: 4000 }), fase("ex", 60, 1, { liberadaEm: "x", valorPagamento: 6000 })];
    expect(bloqueioValorEmModoFase(10000, f)).toBeNull();
    expect(bloqueioValorEmModoFase(11000, f)).toMatch(/Produção/);
  });
});

describe("rotuloDisciplinaPagamento", () => {
  it("disciplina · fase, e só disciplina no modo inteiro", () => {
    expect(rotuloDisciplinaPagamento("Elétrica", "BS")).toBe("Elétrica · BS");
    expect(rotuloDisciplinaPagamento("Elétrica", null)).toBe("Elétrica");
  });
});
