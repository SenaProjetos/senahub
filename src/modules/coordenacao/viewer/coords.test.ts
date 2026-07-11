import { describe, it, expect } from "vitest";
import { threeParaIfc, ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";

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
});
