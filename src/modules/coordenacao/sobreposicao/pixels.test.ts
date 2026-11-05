import { describe, expect, it } from "vitest";
import { hexParaRgb, mascaraDeTinta, tingir } from "./pixels";

const COR: [number, number, number] = [37, 99, 235];

function pixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

describe("tingir", () => {
  it("pixel branco some (alfa 0)", () => {
    const d = pixel(255, 255, 255);
    tingir(d, COR);
    expect(d[3]).toBe(0);
  });

  it("pixel preto fica opaco na cor da camada", () => {
    const d = pixel(0, 0, 0);
    tingir(d, COR);
    expect([...d]).toEqual([37, 99, 235, 255]);
  });

  it("cinza médio vira meia tinta (alfa ≈ 128)", () => {
    const d = pixel(128, 128, 128);
    tingir(d, COR);
    expect(d[3]).toBeGreaterThanOrEqual(127);
    expect(d[3]).toBeLessThanOrEqual(128);
    expect([d[0], d[1], d[2]]).toEqual(COR);
  });

  it("usa a luminância do pixel ORIGINAL (pesos 0.299/0.587/0.114)", () => {
    // Vermelho puro: lum = 0.299 → alfa = round(255 × 0.701) = 179.
    const d = pixel(255, 0, 0);
    tingir(d, [0, 0, 0]);
    expect(d[3]).toBe(Math.round(255 * (1 - 0.299)));
  });

  it("tinge todos os pixels do buffer, no lugar", () => {
    const d = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    tingir(d, COR);
    expect([...d]).toEqual([37, 99, 235, 0, 37, 99, 235, 255]);
  });
});

describe("mascaraDeTinta", () => {
  it("marca 1 só onde o alfa passa do limiar padrão (32)", () => {
    const d = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 33, 0, 0, 0, 255]);
    expect([...mascaraDeTinta(d)]).toEqual([0, 0, 1, 1]);
  });

  it("respeita um limiar informado", () => {
    const d = new Uint8ClampedArray([0, 0, 0, 100, 0, 0, 0, 200]);
    expect([...mascaraDeTinta(d, 150)]).toEqual([0, 1]);
  });
});

describe("hexParaRgb", () => {
  it("lê #rrggbb sem diferenciar caixa", () => {
    expect(hexParaRgb("#2563eb")).toEqual([37, 99, 235]);
    expect(hexParaRgb("#2563EB")).toEqual([37, 99, 235]);
    expect(hexParaRgb("#374151")).toEqual([55, 65, 81]);
  });

  it("hex inválido vira preto", () => {
    expect(hexParaRgb("azul")).toEqual([0, 0, 0]);
  });
});
