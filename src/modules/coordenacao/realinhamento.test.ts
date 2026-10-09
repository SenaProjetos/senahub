import { describe, expect, it } from "vitest";
import {
  arrastePlanoParaIfc,
  caminhoVersaoRealinhada,
  fatorMetros,
  girarXY,
  metrosParaUnidadeArquivo,
  pivoDoMundo,
  realinhamentoNulo,
  rotacaoNula,
  somarOffset,
  translacaoSobreOrigem,
  validarRotacao,
  validarVetor,
  vetorNulo,
} from "@/modules/coordenacao/realinhamento";
import { ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";

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

describe("girarXY", () => {
  it("90° anti-horário leva X em Y", () => {
    expect(girarXY([1, 0, 5], 90).map((n) => Math.round(n * 1e9) / 1e9)).toEqual([0, 1, 5]);
  });
  it("direção 2D também gira", () => {
    const [x, y] = girarXY([0, 1], -90);
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(0, 12);
  });
  it("zero graus = identidade", () => {
    expect(girarXY([3, -4, 2], 0)).toEqual([3, -4, 2]);
  });
});

describe("rotacaoNula / realinhamentoNulo", () => {
  it("0 e voltas inteiras não giram", () => {
    expect(rotacaoNula(0)).toBe(true);
    expect(rotacaoNula(360)).toBe(true);
    expect(rotacaoNula(-360)).toBe(true);
  });
  it("giro real não é nulo", () => {
    expect(rotacaoNula(0.5)).toBe(false);
    expect(rotacaoNula(-90)).toBe(false);
  });
  it("só giro, sem vetor, ainda é realinhamento", () => {
    expect(realinhamentoNulo([0, 0, 0], 15)).toBe(false);
    expect(realinhamentoNulo([0, 0, 0], 0)).toBe(true);
  });
});

describe("validarRotacao", () => {
  it("ângulo comum passa", () => {
    expect(validarRotacao(-37.5)).toEqual({ ok: true });
  });
  it("NaN e mais de uma volta reprovam", () => {
    expect(validarRotacao(NaN).ok).toBe(false);
    expect(validarRotacao(361).ok).toBe(false);
  });
});

describe("translacaoSobreOrigem", () => {
  it("sem giro, é o próprio vetor", () => {
    expect(translacaoSobreOrigem([1, 2, 3], 0, [100, 200])).toEqual([1, 2, 3]);
  });

  it("girar em torno do pivô e deslocar = R·p + t'", () => {
    const graus = 33;
    const vetor: Vec3 = [4, -7, 1.5];
    const pivo: [number, number] = [120, 80];
    const t = translacaoSobreOrigem(vetor, graus, pivo);
    for (const p of [[0, 0, 0], [120, 80, 3], [-15, 42, 9]] as Vec3[]) {
      // Esperado: gira em torno do pivô, depois desloca.
      const [gx, gy] = girarXY([p[0] - pivo[0], p[1] - pivo[1]], graus);
      const esperado = [gx + pivo[0] + vetor[0], gy + pivo[1] + vetor[1], p[2] + vetor[2]];
      // Gravado no arquivo: gira em torno da origem e soma t'.
      const [rx, ry] = girarXY(p, graus);
      const gravado = [rx + t[0], ry + t[1], p[2] + t[2]];
      gravado.forEach((c, i) => expect(c).toBeCloseTo(esperado[i], 9));
    }
  });

  it("o pivô fica parado quando o vetor é nulo", () => {
    const pivo: [number, number] = [50, -20];
    const t = translacaoSobreOrigem([0, 0, 0], 90, pivo);
    const [rx, ry] = girarXY(pivo, 90);
    expect(rx + t[0]).toBeCloseTo(50, 9);
    expect(ry + t[1]).toBeCloseTo(-20, 9);
  });
});

describe("pivoDoMundo", () => {
  it("sem base, o mundo do viewer é o próprio arquivo", () => {
    const mundo = ifcParaThree([10, 20, 3]);
    expect(pivoDoMundo(mundo, null)).toEqual([10, 20]);
  });

  it("desconta as coordenadas do primeiro modelo (base, espaço three)", () => {
    const base = [-1000, 0, 500]; // three
    const arquivo: Vec3 = [1010, 520, 0];
    const t = ifcParaThree(arquivo);
    const mundo: Vec3 = [t[0] + base[0], t[1] + base[1], t[2] + base[2]];
    expect(pivoDoMundo(mundo, base)).toEqual([1010, 520]);
  });
});
