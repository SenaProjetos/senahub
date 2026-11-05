import { describe, expect, it } from "vitest";
import {
  aplicar,
  caixaAplicada,
  compor,
  DISTANCIA_MINIMA,
  encaixeInicial,
  IDENTIDADE,
  inverter,
  porDoisPontos,
  porUmPonto,
} from "./transformacao";

const ERRO_MESMO_LUGAR = "Os dois pontos estão no mesmo lugar. Escolha pontos afastados.";

describe("transformação do alinhamento", () => {
  it("IDENTIDADE não mexe no ponto", () => {
    expect(aplicar(IDENTIDADE, { x: 3, y: -4 })).toEqual({ x: 3, y: -4 });
  });

  it("aplicar ∘ inverter = identidade", () => {
    const a = { tx: 120, ty: -40, giro: 33, escala: 2.5 };
    const p = aplicar(inverter(a), aplicar(a, { x: 7, y: 11 }));
    expect(p.x).toBeCloseTo(7, 9);
    expect(p.y).toBeCloseTo(11, 9);
  });

  it("giro positivo é horário em Y-baixo (90° leva +x para +y)", () => {
    const p = aplicar({ tx: 0, ty: 0, giro: 90, escala: 1 }, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });

  it("porDoisPontos recupera a transformação que gerou os destinos", () => {
    const a = { tx: 50, ty: 80, giro: -90, escala: 0.5 };
    const o1 = { x: 0, y: 0 };
    const o2 = { x: 100, y: 0 };
    const r = porDoisPontos(o1, o2, aplicar(a, o1), aplicar(a, o2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.alinhamento.giro).toBeCloseTo(-90, 9);
    expect(r.alinhamento.escala).toBeCloseTo(0.5, 9);
    expect(r.alinhamento.tx).toBeCloseTo(50, 9);
    expect(r.alinhamento.ty).toBeCloseTo(80, 9);
  });

  it("porDoisPontos recusa origens coincidentes", () => {
    expect(porDoisPontos({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, { x: 9, y: 9 })).toEqual({
      ok: false,
      erro: ERRO_MESMO_LUGAR,
    });
  });

  it("porDoisPontos recusa destinos coincidentes", () => {
    expect(porDoisPontos({ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      ok: false,
      erro: ERRO_MESMO_LUGAR,
    });
  });

  it("DISTANCIA_MINIMA é relativa: pontos distantes da origem e quase iguais são coincidentes", () => {
    const r = porDoisPontos(
      { x: 1e6, y: 1e6 },
      { x: 1e6 + DISTANCIA_MINIMA, y: 1e6 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    expect(r.ok).toBe(false);
  });

  it("porUmPonto só desloca", () => {
    const a = porUmPonto({ tx: 0, ty: 0, giro: 30, escala: 2 }, { x: 10, y: 0 }, { x: 500, y: 500 });
    expect(a.giro).toBe(30);
    expect(a.escala).toBe(2);
    const p = aplicar(a, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(500);
  });

  it("compor bate com aplicar duas vezes", () => {
    const externo = { tx: 10, ty: -20, giro: 40, escala: 1.5 };
    const interno = { tx: -7, ty: 33, giro: -75, escala: 0.4 };
    const p = { x: 12, y: -9 };
    const direto = aplicar(externo, aplicar(interno, p));
    const composto = aplicar(compor(externo, interno), p);
    expect(composto.x).toBeCloseTo(direto.x, 9);
    expect(composto.y).toBeCloseTo(direto.y, 9);
  });

  it("compor com o inverso dá identidade", () => {
    const a = { tx: 120, ty: -40, giro: 33, escala: 2.5 };
    const c = compor(inverter(a), a);
    expect(c.tx).toBeCloseTo(0, 9);
    expect(c.ty).toBeCloseTo(0, 9);
    expect(c.giro).toBeCloseTo(0, 9);
    expect(c.escala).toBeCloseTo(1, 9);
  });

  it("encaixeInicial: mesma largura e mesmo centro", () => {
    const a = encaixeInicial(
      { minX: 0, minY: 0, maxX: 10, maxY: 5 },
      { minX: 100, minY: 100, maxX: 300, maxY: 200 },
    );
    expect(a.escala).toBe(20);
    expect(a.giro).toBe(0);
    expect(aplicar(a, { x: 5, y: 2.5 })).toEqual({ x: 200, y: 150 });
  });

  it("giro normalizado em (-180, 180]", () => {
    const a = { tx: 0, ty: 0, giro: 270, escala: 1 };
    const o1 = { x: 0, y: 0 };
    const o2 = { x: 100, y: 0 };
    const r = porDoisPontos(o1, o2, aplicar(a, o1), aplicar(a, o2));
    expect(r.ok && r.alinhamento.giro).toBeCloseTo(-90, 9);
  });

  it("giro de 180° fica em +180 (limite superior incluído)", () => {
    const a = { tx: 0, ty: 0, giro: 180, escala: 1 };
    const o1 = { x: 0, y: 0 };
    const o2 = { x: 100, y: 0 };
    const r = porDoisPontos(o1, o2, aplicar(a, o1), aplicar(a, o2));
    expect(r.ok && r.alinhamento.giro).toBeCloseTo(180, 9);
  });

  it("compor devolve giro normalizado", () => {
    const c = compor({ tx: 0, ty: 0, giro: 170, escala: 1 }, { tx: 0, ty: 0, giro: 170, escala: 1 });
    expect(c.giro).toBeCloseTo(-20, 9);
  });
});

describe("caixaAplicada", () => {
  const caixa = { minX: 0, minY: 0, maxX: 100, maxY: 50 };

  it("identidade devolve a mesma caixa", () => {
    expect(caixaAplicada(IDENTIDADE, caixa)).toEqual(caixa);
  });

  it("escala e translação movem os cantos", () => {
    expect(caixaAplicada({ tx: 10, ty: 20, giro: 0, escala: 2 }, caixa)).toEqual({ minX: 10, minY: 20, maxX: 210, maxY: 120 });
  });

  it("giro de 90° troca largura por altura (caixa dos quatro cantos)", () => {
    const c = caixaAplicada({ tx: 0, ty: 0, giro: 90, escala: 1 }, caixa);
    expect(c.minX).toBeCloseTo(-50, 9);
    expect(c.maxX).toBeCloseTo(0, 9);
    expect(c.minY).toBeCloseTo(0, 9);
    expect(c.maxY).toBeCloseTo(100, 9);
  });
});
