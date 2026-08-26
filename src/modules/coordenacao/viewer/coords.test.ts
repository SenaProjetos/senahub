import { describe, it, expect } from "vitest";
import {
  threeParaIfc,
  ifcParaThree,
  planoCorteIfcParaThree,
  type Vec3,
} from "@/modules/coordenacao/viewer/coords";

function esperarVetor(atual: Vec3, esperado: Vec3) {
  atual.forEach((valor, indice) => expect(valor).toBeCloseTo(esperado[indice], 10));
}

describe("threeParaIfc / ifcParaThree", () => {
  it("mapeia eixos: three Y-up vira ifc Z-up", () => {
    expect(threeParaIfc([1, 2, 3])).toEqual([1, -3, 2]);
  });

  it("é a inversa exata (round-trip) para vários vetores", () => {
    const casos: Vec3[] = [
      [0, 0, 0],
      [1, 2, 3],
      [-5.5, 10, -0.25],
      [100, -200, 300],
    ];
    for (const v of casos) {
      expect(ifcParaThree(threeParaIfc(v))).toEqual(v);
      expect(threeParaIfc(ifcParaThree(v))).toEqual(v);
    }
  });

  it("altura (Y do three) vira componente Z do ifc", () => {
    const alturaThree: Vec3 = [0, 12, 0];
    const [, , zIfc] = threeParaIfc(alturaThree);
    expect(zIfc).toBe(12);
  });

  it("corte no eixo IFC Z acompanha o Z do gizmo, que é Y no three", () => {
    const plano = planoCorteIfcParaThree("z", 0.5, [0, -2, -6], [10, 8, 4]);

    esperarVetor(plano.ponto, [0, 3, 0]);
    esperarVetor(plano.normal, [0, -1, 0]);
  });

  it("corte no eixo IFC Y usa a direção oposta de Z no three", () => {
    const plano = planoCorteIfcParaThree("y", 0.5, [0, -2, -6], [10, 8, 4]);

    esperarVetor(plano.ponto, [0, 0, -1]);
    esperarVetor(plano.normal, [0, 0, 1]);
  });
});
