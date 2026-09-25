import { describe, expect, it } from "vitest";
import { caminhoDaSeta, type PosicaoBarra } from "./gantt-setas";
import type { TipoVinculo } from "./gantt-linhas";

/** Lê `M x y H x V y …` em pontos, para conferir onde a seta começa, onde termina e em que direção chega. */
function pontos(d: string): { x: number; y: number }[] {
  const t = d.split(/\s+/);
  const out: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < t.length; ) {
    const c = t[i];
    if (c === "M") {
      x = Number(t[i + 1]);
      y = Number(t[i + 2]);
      i += 3;
    } else if (c === "H") {
      x = Number(t[i + 1]);
      i += 2;
    } else if (c === "V") {
      y = Number(t[i + 1]);
      i += 2;
    } else throw new Error(`comando inesperado ${c}`);
    out.push({ x, y });
  }
  return out;
}

const LINHA = 28;
const pred: PosicaoBarra = { xIni: 100, xFim: 160, y: 14 };
const sucLonge: PosicaoBarra = { xIni: 220, xFim: 300, y: 14 + LINHA };
const sucPerto: PosicaoBarra = { xIni: 164, xFim: 200, y: 14 + LINHA };
const sucAntes: PosicaoBarra = { xIni: 40, xFim: 90, y: 14 + 2 * LINHA };

describe("caminhoDaSeta — âncoras por tipo de vínculo", () => {
  it("FS: do fim da predecessora ao início da sucessora, chegando da esquerda", () => {
    const p = pontos(caminhoDaSeta("fs", pred, sucLonge, LINHA));
    expect(p[0]).toEqual({ x: 160, y: 14 });
    expect(p.at(-1)).toEqual({ x: 220, y: 14 + LINHA });
    expect(p.at(-1)!.x).toBeGreaterThan(p.at(-2)!.x);
  });

  it("FS com a sucessora colada (sem espaço para o cotovelo): contorna pela divisa e ainda chega da esquerda", () => {
    const p = pontos(caminhoDaSeta("fs", pred, sucPerto, LINHA));
    expect(p[0]).toEqual({ x: 160, y: 14 });
    expect(p.at(-1)).toEqual({ x: 164, y: 14 + LINHA });
    expect(p.at(-1)!.x).toBeGreaterThan(p.at(-2)!.x);
    expect(p.some((q) => q.y === 14 + LINHA / 2)).toBe(true);
  });

  it("FS com a sucessora começando ANTES da predecessora terminar (linha de baixo, à esquerda)", () => {
    const p = pontos(caminhoDaSeta("fs", pred, sucAntes, LINHA));
    expect(p.at(-1)).toEqual({ x: 40, y: 14 + 2 * LINHA });
    expect(p.at(-1)!.x).toBeGreaterThan(p.at(-2)!.x);
  });

  it("SS: do início ao início, saindo e chegando pela esquerda", () => {
    const p = pontos(caminhoDaSeta("ss", pred, sucLonge, LINHA));
    expect(p[0]).toEqual({ x: 100, y: 14 });
    expect(p.at(-1)).toEqual({ x: 220, y: 14 + LINHA });
    expect(Math.min(...p.map((q) => q.x))).toBeLessThan(100);
    expect(p.at(-1)!.x).toBeGreaterThan(p.at(-2)!.x);
  });

  it("FF: do fim ao fim, saindo e chegando pela direita", () => {
    const p = pontos(caminhoDaSeta("ff", pred, sucLonge, LINHA));
    expect(p[0]).toEqual({ x: 160, y: 14 });
    expect(p.at(-1)).toEqual({ x: 300, y: 14 + LINHA });
    expect(p.at(-1)!.x).toBeLessThan(p.at(-2)!.x);
  });

  it("SF: do início ao fim, chegando pela direita (contorna quando o fim da sucessora está à direita)", () => {
    const p = pontos(caminhoDaSeta("sf", pred, sucLonge, LINHA));
    expect(p[0]).toEqual({ x: 100, y: 14 });
    expect(p.at(-1)).toEqual({ x: 300, y: 14 + LINHA });
    expect(p.at(-1)!.x).toBeLessThan(p.at(-2)!.x);
  });

  it("SF simples: fim da sucessora bem à esquerda do início da predecessora", () => {
    const p = pontos(caminhoDaSeta("sf", pred, sucAntes, LINHA));
    expect(p.at(-1)).toEqual({ x: 90, y: 14 + 2 * LINHA });
    expect(p.at(-1)!.x).toBeLessThan(p.at(-2)!.x);
  });

  it("sucessora numa linha ACIMA da predecessora também liga", () => {
    const acima: PosicaoBarra = { xIni: 300, xFim: 340, y: 14 - LINHA };
    for (const tipo of ["fs", "ss", "ff", "sf"] as TipoVinculo[]) {
      const p = pontos(caminhoDaSeta(tipo, pred, acima, LINHA));
      expect(p.at(-1)!.y).toBe(14 - LINHA);
    }
  });

  it("só segmentos ortogonais: cada passo muda x ou y, nunca os dois", () => {
    for (const tipo of ["fs", "ss", "ff", "sf"] as TipoVinculo[]) {
      for (const suc of [sucLonge, sucPerto, sucAntes]) {
        const p = pontos(caminhoDaSeta(tipo, pred, suc, LINHA));
        for (let i = 1; i < p.length; i++) expect(p[i].x === p[i - 1].x || p[i].y === p[i - 1].y).toBe(true);
      }
    }
  });
});
