import { describe, expect, it } from "vitest";
import {
  detectarConflitos,
  sobreposicaoAABB,
  TOLERANCIA_PADRAO,
  type Caixa,
} from "@/modules/coordenacao/clash";

function caixa(localId: number, min: [number, number, number], max: [number, number, number]): Caixa {
  return { localId, min, max };
}

describe("sobreposicaoAABB", () => {
  const tol = TOLERANCIA_PADRAO;

  it("caixas separadas → null", () => {
    const a = caixa(1, [0, 0, 0], [1, 1, 1]);
    const b = caixa(2, [2, 2, 2], [3, 3, 3]);
    expect(sobreposicaoAABB(a, b, tol)).toBeNull();
  });

  it("interpenetração → profundidade (menor eixo) + centro corretos", () => {
    const a = caixa(1, [0, 0, 0], [2, 2, 2]);
    const b = caixa(2, [1, 1, 1], [3, 3, 3]);
    const c = sobreposicaoAABB(a, b, tol)!;
    expect(c.profundidade).toBeCloseTo(1, 6);
    expect(c.centro).toEqual([1.5, 1.5, 1.5]);
  });

  it("profundidade = MENOR penetração entre eixos", () => {
    // Sobrepõe muito em X/Y (1.0) e pouco em Z (0.3).
    const a = caixa(1, [0, 0, 0], [2, 2, 2]);
    const b = caixa(2, [1, 1, 1.7], [3, 3, 4]);
    const c = sobreposicaoAABB(a, b, tol)!;
    expect(c.profundidade).toBeCloseTo(0.3, 6);
  });

  it("encoste exato (face colada) não conta como conflito", () => {
    const a = caixa(1, [0, 0, 0], [1, 1, 1]);
    const b = caixa(2, [1, 0, 0], [2, 1, 1]); // toca em x=1, overlap 0
    expect(sobreposicaoAABB(a, b, tol)).toBeNull();
  });

  it("sobreposição menor que a tolerância → null", () => {
    const a = caixa(1, [0, 0, 0], [2, 2, 2]);
    const b = caixa(2, [1.9995, 0, 0], [3, 2, 2]); // overlap x = 0.0005 < 0.001
    expect(sobreposicaoAABB(a, b, TOLERANCIA_PADRAO)).toBeNull();
  });
});

describe("detectarConflitos", () => {
  it("conjuntos sem sobreposição → vazio", () => {
    const A = [caixa(1, [0, 0, 0], [1, 1, 1])];
    const B = [caixa(2, [5, 5, 5], [6, 6, 6])];
    expect(detectarConflitos(A, B)).toEqual([]);
  });

  it("um conflito A×B com localIds na origem certa", () => {
    const A = [caixa(10, [0, 0, 0], [2, 2, 2])];
    const B = [caixa(20, [1, 1, 1], [3, 3, 3])];
    const r = detectarConflitos(A, B);
    expect(r).toHaveLength(1);
    expect(r[0].localIdA).toBe(10);
    expect(r[0].localIdB).toBe(20);
  });

  it("localIdA sempre do conjunto A mesmo quando B ordena antes (min.x menor)", () => {
    const A = [caixa(10, [5, 0, 0], [8, 2, 2])]; // começa depois no X
    const B = [caixa(20, [4, 0, 0], [6, 2, 2])]; // começa antes → ordena primeiro
    const r = detectarConflitos(A, B);
    expect(r).toHaveLength(1);
    expect(r[0].localIdA).toBe(10);
    expect(r[0].localIdB).toBe(20);
  });

  it("ignora conflitos DENTRO do mesmo conjunto (A×A, B×B)", () => {
    const A = [
      caixa(1, [0, 0, 0], [2, 2, 2]),
      caixa(2, [1, 1, 1], [3, 3, 3]), // sobrepõe o #1, mas ambos são A
    ];
    const B = [caixa(3, [50, 50, 50], [51, 51, 51])];
    expect(detectarConflitos(A, B)).toEqual([]);
  });

  it("detecta múltiplos conflitos", () => {
    const A = [caixa(1, [0, 0, 0], [2, 2, 2]), caixa(2, [10, 0, 0], [12, 2, 2])];
    const B = [caixa(3, [1, 1, 1], [3, 3, 3]), caixa(4, [11, 1, 1], [13, 3, 3])];
    const r = detectarConflitos(A, B);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((c) => c.localIdA))).toEqual(new Set([1, 2]));
  });

  it("aceita tuning de tolerância por execução", () => {
    const A = [caixa(1, [0, 0, 0], [2, 2, 2])];
    const B = [caixa(2, [1.995, 0, 0], [3, 2, 2])]; // penetração de 5 mm em X
    expect(detectarConflitos(A, B, 0.001)).toHaveLength(1);
    expect(detectarConflitos(A, B, 0.01)).toEqual([]);
  });

  it("sweep-and-prune: elementos distantes no X não geram par (correção)", () => {
    // 1000 caixas de A alinhadas em X, 1 de B longe de todas menos a última.
    const A = Array.from({ length: 1000 }, (_, i) => caixa(i, [i * 10, 0, 0], [i * 10 + 1, 1, 1]));
    const B = [caixa(9999, [9995, 0, 0], [9996, 1, 1])]; // sobrepõe só a caixa i=999 (x 9990..9991)? não — testa não-colisão
    // Ajuste: B em 9990.5..9991.5 sobrepõe a caixa i=999 (9990..9991).
    const B2 = [caixa(9999, [9990.5, 0, 0], [9991.5, 1, 1])];
    expect(detectarConflitos(A, B)).toEqual([]);
    const r = detectarConflitos(A, B2);
    expect(r).toHaveLength(1);
    expect(r[0].localIdA).toBe(999);
  });
});
