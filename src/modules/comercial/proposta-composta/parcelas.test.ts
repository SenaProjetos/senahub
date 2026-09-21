import { describe, expect, it } from "vitest";
import { calcularParcelas, rotuloPercentual, somaPercentuais, type ParcelaEntrada } from "./parcelas";

const plano = (...pcts: number[]): ParcelaEntrada[] => pcts.map((percentual, i) => ({ descricao: `Marco ${i + 1}`, percentual }));

function ok(total: number, parcelas: ParcelaEntrada[]) {
  const r = calcularParcelas(total, parcelas);
  if (!r.ok) throw new Error(`esperava plano válido: ${r.mensagem}`);
  return r;
}
/** Soma em centavos inteiros — comparar reais somados em ponto flutuante mascararia o erro. */
const somaCentavos = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 100), 0);

describe("calcularParcelas", () => {
  it("30/30/40 de R$ 100.000 fecha exato", () => {
    const r = ok(100_000, plano(30, 30, 40));
    expect(r.parcelas.map((p) => p.valor)).toEqual([30_000, 30_000, 40_000]);
    expect(r.parcelas[0].valorExtenso).toBe("trinta mil reais");
    expect(r.total).toBe(100_000);
  });

  it("a última parcela absorve o arredondamento: a soma é exata no centavo", () => {
    const r = ok(100.01, plano(33.33, 33.33, 33.34));
    expect(somaCentavos(r.parcelas.map((p) => p.valor))).toBe(10001);
  });

  it("a soma fecha o total em MUITOS planos e totais (não só nos exemplos)", () => {
    const planos = [plano(50, 50), plano(30, 30, 40), plano(20, 20, 20, 20, 20), plano(33.33, 33.33, 33.34), plano(7, 13, 25, 55), plano(0.01, 99.99)];
    const totais = [0.01, 0.99, 1, 99.99, 1234.56, 47_500, 105_000, 999_999.99, 123_456_789.01, 9_999_999_999.99];
    for (const pl of planos) {
      for (const t of totais) {
        const r = calcularParcelas(t, pl);
        if (!r.ok) {
          expect(r.erro).toBe("total_pequeno_demais"); // única recusa legítima aqui
          continue;
        }
        expect(somaCentavos(r.parcelas.map((p) => p.valor))).toBe(Math.round(t * 100));
        expect(r.parcelas.every((p) => p.valor >= 0)).toBe(true);
      }
    }
  });

  it("o caso real que cobrou R$ 4.750 a mais: 3ª parcela de 50% não vira 40%", () => {
    // Edif. Vitória: total R$ 47.500. Antes: 3ª "40%" escrita como R$ 23.750 (que é 50%).
    const r = ok(47_500, plano(30, 20, 50));
    expect(r.parcelas.map((p) => p.valor)).toEqual([14_250, 9_500, 23_750]);
    expect(somaCentavos(r.parcelas.map((p) => p.valor))).toBe(4_750_000);
  });

  it("recusa o plano que soma mais de 100% (Villa Lunda somava 110%)", () => {
    const r = calcularParcelas(105_000, plano(30, 30, 50));
    expect(r).toMatchObject({ ok: false, erro: "soma_diferente_de_100", somaPercentuais: 110 });
    if (!r.ok) expect(r.mensagem).toContain("110%");
  });

  it("recusa o plano que soma menos de 100%", () => {
    expect(calcularParcelas(1000, plano(30, 30))).toMatchObject({ ok: false, erro: "soma_diferente_de_100", somaPercentuais: 60 });
  });

  it("não se engana com ponto flutuante: 33,33 + 33,33 + 33,34 é exatamente 100", () => {
    expect(somaPercentuais(plano(33.33, 33.33, 33.34))).toBe(100);
    expect(calcularParcelas(1000, plano(0.1, 0.2, 99.7)).ok).toBe(true); // 0.1 + 0.2 + 99.7 ≠ 100 em double
  });

  it("recusa percentual zero, negativo, acima de 100 ou não numérico", () => {
    for (const p of [0, -10, 101, NaN, Infinity]) {
      expect(calcularParcelas(1000, plano(p, 100 - (Number.isFinite(p) ? p : 0)))).toMatchObject({ ok: false, erro: "percentual_invalido" });
    }
  });

  it("recusa total inválido e plano vazio", () => {
    for (const t of [0, -5, NaN]) expect(calcularParcelas(t, plano(100))).toMatchObject({ ok: false, erro: "total_invalido" });
    expect(calcularParcelas(1000, [])).toMatchObject({ ok: false, erro: "sem_parcelas" });
  });

  it("uma parcela única de 100% é o total", () => {
    expect(ok(2805, plano(100)).parcelas[0]).toMatchObject({ valor: 2805, valorExtenso: "dois mil oitocentos e cinco reais" });
  });

  it("total de poucos centavos que estouraria a última parcela é recusado, não devolvido negativo", () => {
    // 4 × 25% de R$ 0,02: cada uma arredonda para R$ 0,01 e sobraria −R$ 0,01 para a última.
    expect(calcularParcelas(0.02, plano(25, 25, 25, 25))).toMatchObject({ ok: false, erro: "total_pequeno_demais" });
  });

  it("repassa descrição e prazo, e escreve o percentual como pt-BR", () => {
    const r = ok(1000, [
      { descricao: "Assinatura", percentual: 33.33, prazo: "à vista" },
      { descricao: "Entrega", percentual: 66.67 },
    ]);
    expect(r.parcelas[0]).toMatchObject({ descricao: "Assinatura", prazo: "à vista", percentualRotulo: "33,33%" });
    expect(r.parcelas[1].percentualRotulo).toBe("66,67%");
  });

  it("total com mais de 2 casas é arredondado como o banco (não trunca)", () => {
    expect(ok(100.005, plano(100)).total).toBe(100.01);
  });
});

describe("rotuloPercentual / somaPercentuais", () => {
  it("formata sem zeros à direita", () => {
    expect(rotuloPercentual(30)).toBe("30%");
    expect(rotuloPercentual(12.5)).toBe("12,5%");
    expect(rotuloPercentual(33.33)).toBe("33,33%");
  });

  it("soma serve ao editor enquanto o plano ainda está incompleto", () => {
    expect(somaPercentuais(plano(30, 30))).toBe(60);
    expect(somaPercentuais([])).toBe(0);
    expect(somaPercentuais([{ percentual: NaN }, { percentual: 40 }])).toBe(40);
  });
});
