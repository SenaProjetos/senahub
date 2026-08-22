import { describe, it, expect } from "vitest";
import {
  versaoVigente,
  proximoNumeroVersao,
  calcularValoresVersao,
  percentualDesconto,
} from "@/modules/comercial/versoes";

describe("versaoVigente — sempre a de maior número, derivada", () => {
  it("lista vazia devolve null (proposta recém-criada ainda não tem versão)", () => {
    expect(versaoVigente([])).toBeNull();
  });

  it("devolve a de maior número, independente da ordem do array", () => {
    const vs = [{ numero: 2 }, { numero: 5 }, { numero: 1 }];
    expect(versaoVigente(vs)).toEqual({ numero: 5 });
  });

  it("com uma versão só, ela é a vigente", () => {
    expect(versaoVigente([{ numero: 1 }])).toEqual({ numero: 1 });
  });

  it("preserva o objeto inteiro, não só o número", () => {
    const vs = [{ numero: 1, autor: "Ana" }, { numero: 2, autor: "Bia" }];
    expect(versaoVigente(vs)).toEqual({ numero: 2, autor: "Bia" });
  });

  it("números não-contíguos não confundem (v1 e v7, sem v2..v6)", () => {
    expect(versaoVigente([{ numero: 1 }, { numero: 7 }])?.numero).toBe(7);
  });
});

describe("proximoNumeroVersao", () => {
  it("primeira versão é a 1", () => {
    expect(proximoNumeroVersao([])).toBe(1);
  });

  it("continua a partir da maior, não da contagem", () => {
    // 2 versões, mas numeradas 1 e 7 → a próxima é 8, nunca 3.
    expect(proximoNumeroVersao([{ numero: 1 }, { numero: 7 }])).toBe(8);
  });
});

describe("calcularValoresVersao — o trio é auto-contido na versão", () => {
  const itens = [{ valor: 1000 }, { valor: 2500.5 }];

  it("sem desconto: valorVersao é igual ao original, e desconto fica null", () => {
    expect(calcularValoresVersao(itens)).toEqual({
      valorOriginal: 3500.5,
      desconto: null,
      valorVersao: 3500.5,
    });
  });

  it("com desconto: valorVersao é o original menos o abatimento", () => {
    expect(calcularValoresVersao(itens, 500)).toEqual({
      valorOriginal: 3500.5,
      desconto: 500,
      valorVersao: 3000.5,
    });
  });

  it("desconto zero é tratado como SEM desconto (null), não como abatimento de R$ 0", () => {
    const v = calcularValoresVersao(itens, 0);
    expect(v.desconto).toBeNull();
    expect(v.valorVersao).toBe(v.valorOriginal);
  });

  it("desconto negativo é ignorado — nunca vira acréscimo por engano", () => {
    const v = calcularValoresVersao(itens, -100);
    expect(v.desconto).toBeNull();
    expect(v.valorVersao).toBe(3500.5);
  });

  it("sem itens, tudo é zero (proposta ainda vazia — o caso da proposta de produção)", () => {
    expect(calcularValoresVersao([])).toEqual({ valorOriginal: 0, desconto: null, valorVersao: 0 });
  });

  /**
   * O ponto que a escolha de nome mais arrisca: `valorOriginal` é o valor CHEIO desta versão,
   * não o total da v1. Duas versões com itens diferentes têm `valorOriginal` diferente.
   */
  it("valorOriginal é desta versão, NÃO uma linha de base da v1", () => {
    const v1 = calcularValoresVersao([{ valor: 1000 }]);
    const v2 = calcularValoresVersao([{ valor: 4000 }]);
    expect(v1.valorOriginal).toBe(1000);
    expect(v2.valorOriginal).toBe(4000);
  });
});

describe("percentualDesconto — a conta que a F5.8 vai validar", () => {
  it("10% de 1000 é 100", () => {
    expect(percentualDesconto({ valorOriginal: 1000, desconto: 100 })).toBe(10);
  });

  it("sem desconto devolve null, não zero", () => {
    expect(percentualDesconto({ valorOriginal: 1000, desconto: null })).toBeNull();
  });

  it("valor original zero devolve null em vez de Infinity", () => {
    expect(percentualDesconto({ valorOriginal: 0, desconto: 50 })).toBeNull();
  });

  it("acima do limite de 10% é detectável (o caso que a F5.8 recusa)", () => {
    const pct = percentualDesconto({ valorOriginal: 1000, desconto: 150 });
    expect(pct).toBe(15);
    expect(pct! > 10).toBe(true);
  });
});
