import { describe, expect, it } from "vitest";
import { diffVersoes, TOLERANCIA_MOVIDO, type CentroPorGuid } from "@/modules/coordenacao/diff";

function mapa(entradas: Record<string, [number, number, number]>): CentroPorGuid {
  return new Map(Object.entries(entradas));
}

describe("diffVersoes", () => {
  it("versões idênticas → tudo inalterado", () => {
    const m = mapa({ a: [0, 0, 0], b: [1, 1, 1] });
    const r = diffVersoes(m, mapa({ a: [0, 0, 0], b: [1, 1, 1] }));
    expect(r.adicionados).toEqual([]);
    expect(r.removidos).toEqual([]);
    expect(r.movidos).toEqual([]);
    expect(r.inalterados).toBe(2);
  });

  it("adicionado = guid só na nova", () => {
    const r = diffVersoes(mapa({ a: [0, 0, 0] }), mapa({ a: [0, 0, 0], b: [5, 5, 5] }));
    expect(r.adicionados).toEqual(["b"]);
    expect(r.inalterados).toBe(1);
  });

  it("removido = guid só na antiga", () => {
    const r = diffVersoes(mapa({ a: [0, 0, 0], c: [9, 9, 9] }), mapa({ a: [0, 0, 0] }));
    expect(r.removidos).toEqual(["c"]);
    expect(r.inalterados).toBe(1);
  });

  it("movido = mesmo guid, centro deslocou > tolerância", () => {
    const r = diffVersoes(mapa({ a: [0, 0, 0] }), mapa({ a: [1, 0, 0] })); // 1m >> 1cm
    expect(r.movidos).toEqual([{ guid: "a", delta: 1 }]);
    expect(r.inalterados).toBe(0);
  });

  it("deslocamento dentro da tolerância NÃO conta como movido", () => {
    const r = diffVersoes(mapa({ a: [0, 0, 0] }), mapa({ a: [0.005, 0, 0] }), TOLERANCIA_MOVIDO); // 5mm < 1cm
    expect(r.movidos).toEqual([]);
    expect(r.inalterados).toBe(1);
  });

  it("movidos ordenados por maior deslocamento primeiro", () => {
    const antiga = mapa({ a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] });
    const nova = mapa({ a: [0.5, 0, 0], b: [2, 0, 0], c: [0.1, 0, 0] });
    const r = diffVersoes(antiga, nova);
    expect(r.movidos.map((m) => m.guid)).toEqual(["b", "a", "c"]);
  });

  it("caso misto completo", () => {
    const antiga = mapa({ igual: [0, 0, 0], movido: [0, 0, 0], removido: [1, 1, 1] });
    const nova = mapa({ igual: [0, 0, 0], movido: [0, 0, 3], adicionado: [9, 9, 9] });
    const r = diffVersoes(antiga, nova);
    expect(r.adicionados).toEqual(["adicionado"]);
    expect(r.removidos).toEqual(["removido"]);
    expect(r.movidos).toEqual([{ guid: "movido", delta: 3 }]);
    expect(r.inalterados).toBe(1);
  });

  it("mapas vazios → resultado vazio", () => {
    const r = diffVersoes(new Map(), new Map());
    expect(r).toEqual({ adicionados: [], removidos: [], movidos: [], inalterados: 0 });
  });
});
