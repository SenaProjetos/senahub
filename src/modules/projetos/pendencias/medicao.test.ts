import { describe, expect, it } from "vitest";
import {
  comprimentoEmPontos,
  escalaEquivalente,
  ESCALAS_COMUNS,
  fatorPorCalibracao,
  fatorPorEscala,
  formatarMedida,
  medirMm,
  MM_POR_PONTO,
  MODO_CALIBRACAO_LABEL,
  MODOS_CALIBRACAO,
  rotuloCalibracao,
} from "@/modules/projetos/pendencias/medicao";

// A1 deitada e A1 em pé, em PONTOS — os dois formatos reais do acervo.
// 841×594 mm ≈ 2384×1684 pt; a mesma folha /Rotate 270 é vista como 1684×2384 pt.
const A1_DEITADA = { w: 2384, h: 1684 };
const A1_EM_PE = { w: 1684, h: 2384 };

describe("catálogo", () => {
  it("todo modo tem rótulo pt-BR", () => {
    for (const m of MODOS_CALIBRACAO) expect(MODO_CALIBRACAO_LABEL[m]).toBeTruthy();
  });
  it("as escalas comuns são denominadores positivos e crescentes", () => {
    expect(ESCALAS_COMUNS.every((e) => e > 0)).toBe(true);
    expect([...ESCALAS_COMUNS]).toEqual([...ESCALAS_COMUNS].sort((a, b) => a - b));
  });
});

describe("fatorPorEscala", () => {
  it("1:1 é o próprio tamanho no papel", () => {
    expect(fatorPorEscala(1)).toBeCloseTo(MM_POR_PONTO, 10);
  });
  it("1:100 amplia cem vezes", () => {
    expect(fatorPorEscala(100)!).toBeCloseTo(MM_POR_PONTO * 100, 10);
  });
  it("recusa denominador inválido em vez de devolver número sem sentido", () => {
    for (const v of [0, -50, NaN, Infinity]) expect(fatorPorEscala(v)).toBeNull();
  });
});

describe("fatorPorCalibracao", () => {
  it("é o valor real dividido pelo comprimento medido", () => {
    expect(fatorPorCalibracao(200, 5000)).toBeCloseTo(25, 10);
  });
  it("recusa entrada degenerada", () => {
    expect(fatorPorCalibracao(0, 5000)).toBeNull();
    expect(fatorPorCalibracao(200, 0)).toBeNull();
    expect(fatorPorCalibracao(-1, 5000)).toBeNull();
    expect(fatorPorCalibracao(200, -5000)).toBeNull();
    expect(fatorPorCalibracao(NaN, 5000)).toBeNull();
  });
});

describe("comprimentoEmPontos", () => {
  it("segmento horizontal cheio é a largura da página", () => {
    const pt = comprimentoEmPontos({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, A1_DEITADA.w, A1_DEITADA.h);
    expect(pt).toBeCloseTo(A1_DEITADA.w, 6);
  });
  it("segmento vertical cheio é a altura da página", () => {
    const pt = comprimentoEmPontos({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, A1_DEITADA.w, A1_DEITADA.h);
    expect(pt).toBeCloseTo(A1_DEITADA.h, 6);
  });

  it("converte CADA EIXO antes de compor — diagonal em página não-quadrada", () => {
    // O erro que este teste existe pra pegar: `hypot(dx, dy)` em coordenada normalizada
    // trataria os dois eixos como se tivessem a mesma escala. Numa A1 (2384×1684) a
    // diagonal de canto a canto tem que dar hypot(2384, 1684), não hypot(1,1)×algo.
    const pt = comprimentoEmPontos({ x: 0, y: 0 }, { x: 1, y: 1 }, A1_DEITADA.w, A1_DEITADA.h);
    expect(pt).toBeCloseTo(Math.hypot(A1_DEITADA.w, A1_DEITADA.h), 6);
    expect(pt).not.toBeCloseTo(Math.SQRT2 * A1_DEITADA.w, 0);
  });

  it("é simétrico e nulo em segmento degenerado", () => {
    const a = { x: 0.2, y: 0.3 };
    const b = { x: 0.7, y: 0.9 };
    expect(comprimentoEmPontos(a, b, 1000, 500)).toBeCloseTo(comprimentoEmPontos(b, a, 1000, 500), 10);
    expect(comprimentoEmPontos(a, a, 1000, 500)).toBe(0);
  });

  it("a MESMA folha girada mede diferente se passarem a dimensão errada", () => {
    // Documenta o motivo de o chamador ter que usar o espaço VISUAL: um segmento horizontal
    // visual de meia página vale 842pt na A1 em pé e 1192pt na deitada. Passar a MediaBox
    // não rotacionada numa prancha /Rotate 270 erra por 41%.
    const visual = comprimentoEmPontos({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, A1_EM_PE.w, A1_EM_PE.h);
    const errado = comprimentoEmPontos({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, A1_DEITADA.w, A1_DEITADA.h);
    expect(visual).toBeCloseTo(842, 0);
    expect(errado).toBeCloseTo(1192, 0);
    expect(errado / visual).toBeCloseTo(1.416, 2);
  });
});

describe("medirMm", () => {
  it("1:1 na A1 deitada devolve a largura real da folha (841 mm)", () => {
    // Ciclo fechado: não depende de régua externa. É também o teste que falha alto se
    // alguém usar a MediaBox onde precisa do visual.
    const mm = medirMm({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, A1_DEITADA.w, A1_DEITADA.h, fatorPorEscala(1)!);
    expect(mm!).toBeCloseTo(841, 0);
  });

  it("1:1 na A1 em pé devolve 594 mm de largura", () => {
    const mm = medirMm({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, A1_EM_PE.w, A1_EM_PE.h, fatorPorEscala(1)!);
    expect(mm!).toBeCloseTo(594, 0);
  });

  it("1:50 multiplica a medida do papel por 50", () => {
    const papel = medirMm({ x: 0, y: 0 }, { x: 0.1, y: 0 }, A1_DEITADA.w, A1_DEITADA.h, fatorPorEscala(1)!)!;
    const real = medirMm({ x: 0, y: 0 }, { x: 0.1, y: 0 }, A1_DEITADA.w, A1_DEITADA.h, fatorPorEscala(50)!)!;
    expect(real / papel).toBeCloseTo(50, 6);
  });

  it("IDA E VOLTA da calibração: calibrar com 5 m e medir o mesmo segmento devolve 5 m", () => {
    const a = { x: 0.2, y: 0.3 };
    const b = { x: 0.6, y: 0.55 };
    const pt = comprimentoEmPontos(a, b, A1_DEITADA.w, A1_DEITADA.h);
    const fator = fatorPorCalibracao(pt, 5000)!;
    expect(medirMm(a, b, A1_DEITADA.w, A1_DEITADA.h, fator)!).toBeCloseTo(5000, 6);
  });

  it("calibração é linear: o dobro do segmento mede o dobro", () => {
    const fator = fatorPorCalibracao(comprimentoEmPontos({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 1000, 1000), 1000)!;
    const dobro = medirMm({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 1000, 1000, fator)!;
    expect(dobro).toBeCloseTo(2000, 6);
  });

  it("recusa fator ou segmento inválido", () => {
    expect(medirMm({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 1000, 0)).toBeNull();
    expect(medirMm({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 1000, NaN)).toBeNull();
    expect(medirMm({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 1000, 1)).toBeNull();
  });
});

describe("escalaEquivalente", () => {
  it("volta ao denominador que gerou o fator", () => {
    for (const d of [1, 50, 100, 1000]) {
      expect(escalaEquivalente(fatorPorEscala(d)!)!).toBeCloseTo(d, 6);
    }
  });
  it("null em fator inválido", () => {
    expect(escalaEquivalente(0)).toBeNull();
    expect(escalaEquivalente(NaN)).toBeNull();
  });
});

describe("formatarMedida", () => {
  it("troca de unidade pela ordem de grandeza", () => {
    expect(formatarMedida(8)).toBe("8 mm");
    expect(formatarMedida(355)).toBe("35,5 cm");
    expect(formatarMedida(5000)).toBe("5,00 m");
    expect(formatarMedida(12345)).toBe("12,35 m");
  });
  it("usa vírgula decimal (pt-BR)", () => {
    expect(formatarMedida(1500)).toContain(",");
    expect(formatarMedida(1500)).not.toContain(".");
  });
  it("valor ausente ou inválido vira travessão, não NaN na tela", () => {
    for (const v of [null, undefined, NaN, -5]) expect(formatarMedida(v)).toBe("—");
  });
});

describe("rotuloCalibracao", () => {
  it("mostra a escala quando foi declarada", () => {
    expect(rotuloCalibracao("escala", 50)).toBe("1:50");
  });
  it("mostra 'calibrada' no modo dois pontos", () => {
    expect(rotuloCalibracao("dois_pontos", null)).toBe("calibrada");
  });
  it("sem calibração é explícito, não vazio", () => {
    expect(rotuloCalibracao(null, null)).toBe("sem escala");
    expect(rotuloCalibracao("escala", null)).toBe("sem escala");
  });
});
