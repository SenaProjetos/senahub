import { describe, expect, it } from "vitest";
import {
  agruparRegioes,
  comparaveis,
  compararTiles,
  LIMITE_REGIOES,
  resumirDiff,
  TOLERANCIA,
} from "@/modules/projetos/pendencias/diff";

/** Imagem RGBA branca opaca. */
function branca(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  return d;
}
function pintar(d: Uint8ClampedArray, w: number, x: number, y: number, v: [number, number, number]) {
  const i = (y * w + x) * 4;
  d[i] = v[0];
  d[i + 1] = v[1];
  d[i + 2] = v[2];
}

const W = 64;
const H = 64;
const TILE = 16; // 4x4 = 16 ladrilhos

describe("compararTiles", () => {
  it("imagens idênticas não acusam nada — é o piso de ruído do método", () => {
    const a = branca(W, H);
    const b = branca(W, H);
    const g = compararTiles(a, b, { largura: W, altura: H, tile: TILE });
    expect(g.pixelsDiferentes).toBe(0);
    expect(g.tilesAlterados).toBe(0);
    expect(g.cols * g.rows).toBe(16);
  });

  it("um único pixel diferente marca exatamente UM ladrilho", () => {
    const a = branca(W, H);
    const b = branca(W, H);
    pintar(b, W, 20, 35, [0, 0, 0]);
    const g = compararTiles(a, b, { largura: W, altura: H, tile: TILE });
    expect(g.pixelsDiferentes).toBe(1);
    expect(g.tilesAlterados).toBe(1);
    // (20,35) cai no ladrilho coluna 1, linha 2
    expect(g.grade[2 * g.cols + 1]).toBe(1);
  });

  it("respeita a tolerância: diferença IGUAL ao limite não conta, acima conta", () => {
    const a = branca(W, H);
    const noLimite = branca(W, H);
    pintar(noLimite, W, 5, 5, [255 - TOLERANCIA, 255, 255]);
    expect(compararTiles(a, noLimite, { largura: W, altura: H, tile: TILE }).pixelsDiferentes).toBe(0);

    const acima = branca(W, H);
    pintar(acima, W, 5, 5, [255 - TOLERANCIA - 1, 255, 255]);
    expect(compararTiles(a, acima, { largura: W, altura: H, tile: TILE }).pixelsDiferentes).toBe(1);
  });

  it("detecta mudança em qualquer canal RGB", () => {
    const a = branca(W, H);
    for (const cor of [[0, 255, 255], [255, 0, 255], [255, 255, 0]] as const) {
      const b = branca(W, H);
      pintar(b, W, 1, 1, [...cor]);
      expect(compararTiles(a, b, { largura: W, altura: H, tile: TILE }).pixelsDiferentes).toBe(1);
    }
  });

  it("é simétrico — trocar a ordem das revisões dá o mesmo resultado", () => {
    const a = branca(W, H);
    const b = branca(W, H);
    pintar(b, W, 10, 10, [0, 0, 0]);
    const ab = compararTiles(a, b, { largura: W, altura: H, tile: TILE });
    const ba = compararTiles(b, a, { largura: W, altura: H, tile: TILE });
    expect(ba.tilesAlterados).toBe(ab.tilesAlterados);
    expect(ba.pixelsDiferentes).toBe(ab.pixelsDiferentes);
  });

  it("lida com dimensão que não é múltiplo do ladrilho", () => {
    const w = 70;
    const h = 34;
    const g = compararTiles(branca(w, h), branca(w, h), { largura: w, altura: h, tile: TILE });
    expect(g.cols).toBe(Math.ceil(w / TILE));
    expect(g.rows).toBe(Math.ceil(h / TILE));
  });
});

describe("agruparRegioes", () => {
  const cols = 6;
  const rows = 6;
  const gradeCom = (...ks: number[]) => {
    const g = new Uint8Array(cols * rows);
    for (const k of ks) g[k] = 1;
    return g;
  };

  it("grade vazia não gera região", () => {
    expect(agruparRegioes(new Uint8Array(cols * rows), cols, rows, TILE)).toEqual([]);
  });

  it("ladrilhos vizinhos viram UMA região", () => {
    // (1,1) e (2,1) lado a lado
    const r = agruparRegioes(gradeCom(1 * cols + 1, 1 * cols + 2), cols, rows, TILE);
    expect(r).toHaveLength(1);
    expect(r[0].tiles).toBe(2);
    expect(r[0].x).toBe(1 * TILE);
    expect(r[0].largura).toBe(2 * TILE);
    expect(r[0].altura).toBe(TILE);
  });

  it("agrupa na DIAGONAL (8-conectado) — traço inclinado é um objeto só", () => {
    const r = agruparRegioes(gradeCom(1 * cols + 1, 2 * cols + 2), cols, rows, TILE);
    expect(r).toHaveLength(1);
    expect(r[0].tiles).toBe(2);
  });

  it("ladrilhos separados viram regiões distintas", () => {
    const r = agruparRegioes(gradeCom(0 * cols + 0, 5 * cols + 5), cols, rows, TILE);
    expect(r).toHaveLength(2);
  });

  it("não atravessa a borda da grade (vizinhança não dá a volta na linha)", () => {
    // Último da linha 1 e primeiro da linha 2 são adjacentes no ARRAY, mas não na tela.
    const r = agruparRegioes(gradeCom(1 * cols + (cols - 1), 3 * cols + 0), cols, rows, TILE);
    expect(r).toHaveLength(2);
  });

  it("ordena da maior região pra menor", () => {
    const g = gradeCom(0, 1, 2, 5 * cols + 5);
    const r = agruparRegioes(g, cols, rows, TILE);
    expect(r[0].tiles).toBeGreaterThan(r[1].tiles);
  });

  it("aguenta uma região grande sem estourar a pilha (varredura iterativa)", () => {
    const c = 200;
    const rw = 200;
    const g = new Uint8Array(c * rw).fill(1); // 40.000 ladrilhos conectados
    const r = agruparRegioes(g, c, rw, TILE);
    expect(r).toHaveLength(1);
    expect(r[0].tiles).toBe(c * rw);
  });
});

describe("resumirDiff", () => {
  const grade = (cols: number, rows: number, marcados: number[]) => {
    const g = new Uint8Array(cols * rows);
    for (const k of marcados) g[k] = 1;
    let t = 0;
    for (let i = 0; i < g.length; i++) t += g[i];
    return { grade: g, cols, rows, pixelsDiferentes: t, tilesAlterados: t };
  };

  it("sem alteração devolve `mudou: false` — é a metade 'a página mudou?' do item", () => {
    const r = resumirDiff(grade(10, 10, []));
    expect(r.mudou).toBe(false);
    expect(r.regioes).toEqual([]);
    expect(r.fracaoArea).toBe(0);
  });

  it("alteração pontual devolve a região e não marca como muito alterada", () => {
    const r = resumirDiff(grade(10, 10, [55]));
    expect(r.mudou).toBe(true);
    expect(r.regioes).toHaveLength(1);
    expect(r.muitoAlterada).toBe(false);
    expect(r.fracaoArea).toBeCloseTo(0.01, 6);
  });

  it("página quase toda alterada vira RESUMO, não uma caixa por fragmento", () => {
    // 30% da área — acima do limite; é o caso do layout deslocado.
    const marcados = Array.from({ length: 30 }, (_, i) => i);
    const r = resumirDiff(grade(10, 10, marcados));
    expect(r.muitoAlterada).toBe(true);
    expect(r.fracaoArea).toBeCloseTo(0.3, 6);
  });

  it("fragmentação extrema também vira resumo, e a lista fica limitada", () => {
    // Ladrilhos isolados alternados → muitas regiões pequenas.
    const cols = 40;
    const rows = 10;
    const marcados: number[] = [];
    for (let y = 0; y < rows; y += 2) for (let x = 0; x < cols; x += 2) marcados.push(y * cols + x);
    const r = resumirDiff(grade(cols, rows, marcados));
    expect(r.muitoAlterada).toBe(true);
    expect(r.regioes.length).toBeLessThanOrEqual(LIMITE_REGIOES);
  });
});

describe("comparaveis", () => {
  it("mesma proporção é comparável mesmo em tamanhos diferentes", () => {
    expect(comparaveis({ largura: 2384, altura: 1684 }, { largura: 1192, altura: 842 })).toBe(true);
  });
  it("proporção diferente NÃO é comparável — folha trocada ou /Rotate mudou entre revisões", () => {
    expect(comparaveis({ largura: 2384, altura: 1684 }, { largura: 1684, altura: 2384 })).toBe(false);
  });
  it("tolera diferença mínima de arredondamento", () => {
    expect(comparaveis({ largura: 1000, altura: 500 }, { largura: 1001, altura: 500 })).toBe(true);
  });
  it("dimensão degenerada não é comparável", () => {
    expect(comparaveis({ largura: 0, altura: 100 }, { largura: 100, altura: 100 })).toBe(false);
  });
});
