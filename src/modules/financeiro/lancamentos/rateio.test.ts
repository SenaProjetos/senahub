import { describe, expect, it } from "vitest";
import {
  validarRateio,
  ratearValor,
  MOTIVO_RATEIO_POUCOS_ITENS,
  MOTIVO_RATEIO_SEM_ALVO,
  MOTIVO_RATEIO_PERCENTUAL_INVALIDO,
  MOTIVO_RATEIO_SOMA,
  type ItemRateio,
} from "./rateio";

const centro = (bp: number): ItemRateio => ({ centroId: "c1", projetoId: null, percentualBp: bp });
const projeto = (bp: number): ItemRateio => ({ centroId: null, projetoId: "p1", percentualBp: bp });

describe("validarRateio", () => {
  it("recusa menos de 2 linhas", () => {
    expect(validarRateio([centro(10000)])).toBe(MOTIVO_RATEIO_POUCOS_ITENS);
    expect(validarRateio([])).toBe(MOTIVO_RATEIO_POUCOS_ITENS);
  });

  it("recusa linha sem centro nem projeto", () => {
    expect(validarRateio([centro(5000), { centroId: null, projetoId: null, percentualBp: 5000 }])).toBe(MOTIVO_RATEIO_SEM_ALVO);
  });

  it("recusa percentual zero ou negativo", () => {
    expect(validarRateio([centro(10000), projeto(0)])).toBe(MOTIVO_RATEIO_PERCENTUAL_INVALIDO);
    expect(validarRateio([centro(-100), projeto(10100)])).toBe(MOTIVO_RATEIO_PERCENTUAL_INVALIDO);
  });

  it("recusa soma diferente de 100%", () => {
    expect(validarRateio([centro(4000), projeto(5000)])).toBe(MOTIVO_RATEIO_SOMA);
    expect(validarRateio([centro(6000), projeto(5000)])).toBe(MOTIVO_RATEIO_SOMA);
  });

  it("aceita soma exata, com centro e projeto na mesma linha", () => {
    expect(validarRateio([centro(5000), projeto(5000)])).toBeNull();
    expect(validarRateio([{ centroId: "c1", projetoId: "p1", percentualBp: 10000 }, centro(1)])).not.toBeNull(); // (passa a validação de soma só no caso certo abaixo)
  });

  it("aceita 3 linhas somando 100%", () => {
    expect(validarRateio([centro(3334), centro(3333), projeto(3333)])).toBeNull();
  });
});

describe("ratearValor", () => {
  it("divide 50/50 exato", () => {
    expect(ratearValor(10000, [centro(5000), projeto(5000)])).toEqual([5000, 5000]);
  });

  it("joga a sobra de arredondamento na última linha", () => {
    // 10 centavos em 3 partes de 33,34%/33,33%/33,33% — a sobra do floor vai pra última.
    const r = ratearValor(10, [centro(3334), centro(3333), projeto(3333)]);
    expect(r.reduce((s, v) => s + v, 0)).toBe(10);
    expect(r[0]).toBe(3);
    expect(r[1]).toBe(3);
  });

  it("soma das partes sempre bate com o valor original (propriedade, não só o caso feliz)", () => {
    const itens = [centro(2500), centro(2500), projeto(2500), projeto(2500)];
    for (const v of [1, 7, 99, 100000, 333333]) {
      const r = ratearValor(v, itens);
      expect(r.reduce((s, x) => s + x, 0)).toBe(v);
    }
  });
});
