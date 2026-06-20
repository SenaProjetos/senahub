import { describe, it, expect } from "vitest";
import { montarSerieReceita } from "@/modules/dashboard/serie-receita";

// ref fixa: junho/2026 (mês index 5)
const REF = new Date(2026, 5, 15);

describe("montarSerieReceita", () => {
  it("gera um bucket por mês, do mais antigo ao mês de referência", () => {
    const buckets = montarSerieReceita([], [], REF, 6);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toMatchObject({ ano: 2026, mes: 0 }); // jan
    expect(buckets[5]).toMatchObject({ ano: 2026, mes: 5 }); // jun
  });

  it("soma realizado pelo mês da data de confirmação", () => {
    const buckets = montarSerieReceita(
      [{ valor: 1000, data: new Date(2026, 2, 10) }], // mar
      [],
      REF,
      6,
    );
    expect(buckets[2].realizado).toBe(1000);
    expect(buckets[5].realizado).toBe(0);
  });

  it("soma previsto pelo mês de vencimento, mesmo em meses passados (previsto original)", () => {
    const buckets = montarSerieReceita(
      [{ valor: 800, data: new Date(2026, 1, 20) }], // realizado fev
      [{ valor: 800, data: new Date(2026, 1, 5) }], // a mesma receita, prevista p/ fev
      REF,
      6,
    );
    expect(buckets[1].realizado).toBe(800);
    expect(buckets[1].previsto).toBe(800); // antes do fix isto era 0
  });

  it("ignora datas fora da janela", () => {
    const buckets = montarSerieReceita(
      [{ valor: 500, data: new Date(2025, 11, 31) }], // dez/2025, fora
      [],
      REF,
      6,
    );
    expect(buckets.every((b) => b.realizado === 0)).toBe(true);
  });
});
