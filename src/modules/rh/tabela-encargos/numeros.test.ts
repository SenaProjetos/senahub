import { describe, expect, it } from "vitest";
import { lerCentavos, lerPontosBase } from "./numeros";

describe("lerPontosBase", () => {
  it("percentual com vírgula ou ponto", () => {
    expect(lerPontosBase("8")).toBe(800);
    expect(lerPontosBase("2,5")).toBe(250);
    expect(lerPontosBase("2.5")).toBe(250);
    expect(lerPontosBase(" 40 ")).toBe(4000);
  });
  it("lixo e vazio viram null, e fora de 0–100% também", () => {
    expect(lerPontosBase("")).toBeNull();
    expect(lerPontosBase("abc")).toBeNull();
    expect(lerPontosBase("-1")).toBeNull();
    expect(lerPontosBase("101")).toBeNull();
  });
});

describe("lerCentavos", () => {
  it("valor em reais com vírgula decimal e milhar com ponto", () => {
    expect(lerCentavos("200,00")).toBe(20000);
    expect(lerCentavos("1.250,50")).toBe(125050);
    expect(lerCentavos("85")).toBe(8500);
  });
  it("duas vírgulas, texto e negativo viram null", () => {
    expect(lerCentavos("550,00600,00")).toBeNull();
    expect(lerCentavos("R$ 10")).toBeNull();
    expect(lerCentavos("-5")).toBeNull();
    expect(lerCentavos("")).toBeNull();
  });
});
