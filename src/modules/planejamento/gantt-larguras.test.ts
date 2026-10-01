import { describe, expect, it } from "vitest";
import { LARGURA_MAXIMA, LARGURA_MINIMA, comLargura, larguraDaColuna, lerLarguras, limitarLargura } from "./gantt-larguras";

describe("limitarLargura", () => {
  it("encaixa no piso e no teto e arredonda para pixel inteiro", () => {
    expect(limitarLargura(10)).toBe(LARGURA_MINIMA);
    expect(limitarLargura(5000)).toBe(LARGURA_MAXIMA);
    expect(limitarLargura(120.6)).toBe(121);
  });
  it("número inválido não vira largura", () => {
    expect(limitarLargura(NaN)).toBeNull();
    expect(limitarLargura(Infinity)).toBeNull();
  });
});

describe("lerLarguras", () => {
  it("aceita só { id: número }, encaixando cada valor nos limites", () => {
    expect(lerLarguras({ nome: 420, dur: 5, pred: 99999 })).toEqual({ nome: 420, dur: LARGURA_MINIMA, pred: LARGURA_MAXIMA });
  });
  it("lixo da preferência vira vazio (nada quebra a tela)", () => {
    for (const ruim of [null, undefined, "x", 42, [1, 2], true]) expect(lerLarguras(ruim)).toEqual({});
    expect(lerLarguras({ a: "100", b: null, c: NaN, d: 90 })).toEqual({ d: 90 });
  });
});

describe("larguraDaColuna e comLargura", () => {
  it("sem escolha, vale o padrão; com escolha, a do usuário", () => {
    expect(larguraDaColuna("nome", 300, {})).toBe(300);
    expect(larguraDaColuna("nome", 300, { nome: 380 })).toBe(380);
  });
  it("guarda só o que difere do padrão: voltar ao padrão apaga a entrada", () => {
    let l = comLargura({}, "nome", 380, 300);
    expect(l).toEqual({ nome: 380 });
    l = comLargura(l, "dur", 100, 84);
    expect(l).toEqual({ nome: 380, dur: 100 });
    expect(comLargura(l, "nome", 300, 300)).toEqual({ dur: 100 });
  });
  it("não muta o mapa recebido e limita o valor", () => {
    const base = { nome: 380 };
    const novo = comLargura(base, "dur", 1, 84);
    expect(base).toEqual({ nome: 380 });
    expect(novo).toEqual({ nome: 380, dur: LARGURA_MINIMA });
  });
});
