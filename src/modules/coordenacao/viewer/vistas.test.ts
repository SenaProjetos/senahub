import { describe, expect, it } from "vitest";
import {
  atalhoDeVistaPermitido,
  cameraDaVista,
  cameraDaVistaParaCaixa,
  direcaoDaVista,
  VISTAS_PADRAO,
  vistaDaTecla,
  vistaDoEixo,
} from "@/modules/coordenacao/viewer/vistas";
import { threeParaIfc, type Vec3 } from "@/modules/coordenacao/viewer/coords";

const perto = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 2));

describe("direcaoDaVista (IFC, do alvo para a câmera)", () => {
  it("superior olha de cima, com o +Y do IFC no topo da tela", () => {
    const [x, y, z] = direcaoDaVista("superior");
    expect(z).toBeCloseTo(1, 5);
    expect(x).toBe(0);
    expect(y).toBeLessThan(0); // câmera um fio ao sul: olhando para o norte
  });
  it("frontal fica no −Y; laterais no ±X", () => {
    perto(direcaoDaVista("frontal"), [0, -1, 0]);
    perto(direcaoDaVista("direita"), [1, 0, 0]);
    perto(direcaoDaVista("esquerda"), [-1, 0, 0]);
    perto(direcaoDaVista("posterior"), [0, 1, 0]);
  });
  it("isométrica vem do sudeste, de cima, normalizada", () => {
    const d = direcaoDaVista("isometrica");
    expect(Math.hypot(...d)).toBeCloseTo(1, 9);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBeLessThan(0);
    expect(d[2]).toBeGreaterThan(0);
  });
});

describe("cameraDaVista", () => {
  it("põe a câmera na direção da vista, a uma distância que cabe a esfera", () => {
    const { posicao, alvo } = cameraDaVista("direita", [10, 0, 0], 5, 60);
    expect(alvo).toEqual([10, 0, 0]);
    // sin(30°) = 0,5 → 5 / 0,5 × 1,1 = 11 m na direção +X
    perto(posicao, [21, 0, 0]);
  });
  it("superior em three fica acima (Y para cima)", () => {
    const { posicao } = cameraDaVista("superior", [0, 0, 0], 5, 60);
    const ifc = threeParaIfc(posicao);
    expect(ifc[2]).toBeGreaterThan(10);
  });
});

describe("atalhos", () => {
  it("1 a 7 seguem a ordem do menu", () => {
    expect(VISTAS_PADRAO.map((v) => vistaDaTecla(v.atalho))).toEqual(VISTAS_PADRAO.map((v) => v.id));
    expect(vistaDaTecla("8")).toBeNull();
  });
  it("não dispara em campo de digitação nem com modificador", () => {
    const base = { key: "1", ctrlKey: false, metaKey: false, altKey: false, alvoEditavel: false };
    expect(atalhoDeVistaPermitido(base)).toBe("superior");
    expect(atalhoDeVistaPermitido({ ...base, alvoEditavel: true })).toBeNull();
    expect(atalhoDeVistaPermitido({ ...base, ctrlKey: true })).toBeNull();
  });
  it("letra do indicador de eixos leva à vista daquele lado", () => {
    expect(vistaDoEixo("X")).toBe("direita");
    expect(vistaDoEixo("Y")).toBe("posterior");
    expect(vistaDoEixo("Z")).toBe("superior");
    expect(vistaDoEixo("?")).toBeNull();
  });
});

describe("cameraDaVistaParaCaixa", () => {
  it("frontal de um prédio comprido: enquadra pela largura, não pela esfera", () => {
    // Prédio 100 m (X) × 10 m (Y IFC) × 10 m (Z), em three: X 100, Y (altura) 10, Z 10.
    const { posicao, alvo } = cameraDaVistaParaCaixa("frontal", [0, 0, -10], [100, 10, 0], 60, 2);
    expect(alvo).toEqual([50, 5, -5]);
    const ifc = threeParaIfc([posicao[0] - alvo[0], posicao[1] - alvo[1], posicao[2] - alvo[2]]);
    // Câmera no −Y do IFC; meia largura 50 m / tan(H/2), H com aspecto 2 → ~43 m + 5 m de profundidade.
    expect(ifc[1]).toBeLessThan(0);
    expect(Math.abs(ifc[1])).toBeGreaterThan(40);
    expect(Math.abs(ifc[1])).toBeLessThan(60); // a esfera daria ~110 m
  });
});
