import { describe, expect, it } from "vitest";
import {
  arrastePlanoParaIfc,
  caminhoVersaoRealinhada,
  fatorMetros,
  metrosParaUnidadeArquivo,
  somarOffset,
  validarVetor,
  vetorNulo,
} from "@/modules/coordenacao/realinhamento";

describe("fatorMetros", () => {
  it("METRE sem prefixo → 1", () => {
    expect(fatorMetros(null)).toBe(1);
    expect(fatorMetros("")).toBe(1);
    expect(fatorMetros(undefined)).toBe(1);
  });

  it("prefixos SI comuns", () => {
    expect(fatorMetros("MILLI")).toBe(1e-3);
    expect(fatorMetros("CENTI")).toBe(1e-2);
    expect(fatorMetros("KILO")).toBe(1e3);
  });

  it("case-insensitive e com espaços", () => {
    expect(fatorMetros(" milli ")).toBe(1e-3);
    expect(fatorMetros("Centi")).toBe(1e-2);
  });

  it("prefixo desconhecido cai em 1 (não quebra)", () => {
    expect(fatorMetros("BANANA")).toBe(1);
  });
});

describe("metrosParaUnidadeArquivo", () => {
  it("arquivo em milímetros: 1 m vira 1000 unidades", () => {
    expect(metrosParaUnidadeArquivo([1, 2, 3], fatorMetros("MILLI"))).toEqual([1000, 2000, 3000]);
  });

  it("arquivo em metros: identidade", () => {
    expect(metrosParaUnidadeArquivo([1.5, -2, 0], 1)).toEqual([1.5, -2, 0]);
  });

  it("arquivo em centímetros", () => {
    expect(metrosParaUnidadeArquivo([1, 0, 0], fatorMetros("CENTI"))).toEqual([100, 0, 0]);
  });
});

describe("somarOffset", () => {
  it("desloca ponto 3D", () => {
    expect(somarOffset([10, 20, 30], [1, 2, 3])).toEqual([11, 22, 33]);
  });

  it("ponto 2D: só X,Y deslocados", () => {
    expect(somarOffset([10, 20], [1, 2, 3])).toEqual([11, 22]);
  });

  it("componentes extras (>3) intactas", () => {
    expect(somarOffset([1, 2, 3, 99], [1, 1, 1])).toEqual([2, 3, 4, 99]);
  });
});

describe("arrastePlanoParaIfc", () => {
  it("Δx no three vira dx no IFC; Δz vira -dy", () => {
    // three(Δx,0,Δz) → ifc [Δx, -Δz, 0]
    expect(arrastePlanoParaIfc(5, 3)).toEqual({ dx: 5, dy: -3 });
    expect(arrastePlanoParaIfc(-2, -7)).toEqual({ dx: -2, dy: 7 });
  });

  it("arraste nulo → vetor nulo", () => {
    expect(arrastePlanoParaIfc(0, 0)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("vetorNulo", () => {
  it("zero absoluto", () => {
    expect(vetorNulo([0, 0, 0])).toBe(true);
  });
  it("ruído abaixo da tolerância", () => {
    expect(vetorNulo([1e-12, -1e-12, 0])).toBe(true);
  });
  it("deslocamento real não é nulo", () => {
    expect(vetorNulo([0, 0, 0.5])).toBe(false);
  });
});

describe("validarVetor", () => {
  it("vetor são passa", () => {
    expect(validarVetor([10, -5, 2.5])).toEqual({ ok: true });
  });
  it("NaN/Infinity reprovam", () => {
    expect(validarVetor([NaN, 0, 0]).ok).toBe(false);
    expect(validarVetor([0, Infinity, 0]).ok).toBe(false);
  });
  it("absurdo reprova", () => {
    expect(validarVetor([1e8, 0, 0]).ok).toBe(false);
  });
});

describe("caminhoVersaoRealinhada", () => {
  it("original v1 → v2 na mesma pasta", () => {
    expect(caminhoVersaoRealinhada("2026/cliente/001_obra/ELE/A/ELE-modelo.ifc", 2)).toBe(
      "2026/cliente/001_obra/ELE/A/ELE-modelo__v2.ifc",
    );
  });

  it("original já versionado → substitui o sufixo", () => {
    expect(caminhoVersaoRealinhada("2026/c/001_o/ELE/A/ELE-modelo__v3.ifc", 4)).toBe(
      "2026/c/001_o/ELE/A/ELE-modelo__v4.ifc",
    );
  });

  it("normaliza separador do Windows e preserva a pasta", () => {
    expect(caminhoVersaoRealinhada("2026\\c\\001_o\\ARQ\\RECEBIDOS\\m.ifc", 5)).toBe(
      "2026/c/001_o/ARQ/RECEBIDOS/m__v5.ifc",
    );
  });

  it("extensão .IFC maiúscula também é tratada", () => {
    expect(caminhoVersaoRealinhada("p/Modelo.IFC", 2)).toBe("p/Modelo__v2.ifc");
  });
});
