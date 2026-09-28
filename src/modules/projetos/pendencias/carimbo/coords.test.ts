import { describe, expect, it } from "vitest";
import {
  anguloTextoEmPe,
  caixaPdf,
  normalizarRotacao,
  paraPdf,
  paraVisual,
  posicaoRotuloCota,
  tamanhoVisual,
  type Rotacao,
} from "@/modules/projetos/pendencias/carimbo/coords";

// A1 deitada (2384x1684pt) e A1 em pé (1684x2384pt) — os dois formatos reais do acervo.
const W = 2384;
const H = 1684;
const ROTACOES: Rotacao[] = [0, 90, 180, 270];

describe("normalizarRotacao", () => {
  it("aceita os quatro valores canônicos", () => {
    for (const r of ROTACOES) expect(normalizarRotacao(r)).toBe(r);
  });
  it("normaliza negativo e acima de 360 (PDF real traz os dois)", () => {
    expect(normalizarRotacao(-90)).toBe(270);
    expect(normalizarRotacao(450)).toBe(90);
    expect(normalizarRotacao(-450)).toBe(270);
    expect(normalizarRotacao(360)).toBe(0);
  });
  it("arredonda ângulo torto pro múltiplo de 90 mais próximo", () => {
    expect(normalizarRotacao(89)).toBe(90);
    expect(normalizarRotacao(271)).toBe(270);
  });
});

describe("tamanhoVisual", () => {
  it("transpõe em 90/270 e mantém em 0/180", () => {
    expect(tamanhoVisual(W, H, 0)).toEqual({ largura: W, altura: H });
    expect(tamanhoVisual(W, H, 180)).toEqual({ largura: W, altura: H });
    expect(tamanhoVisual(W, H, 90)).toEqual({ largura: H, altura: W });
    expect(tamanhoVisual(W, H, 270)).toEqual({ largura: H, altura: W });
  });
});

describe("paraPdf ↔ paraVisual (ida e volta)", () => {
  // Fecha o ciclo nas QUATRO rotações. O acervo real só tem amostra de 0° e 270°, então
  // 90° e 180° não teriam como ser conferidos contra arquivo nenhum — é aqui que um W/H
  // trocado nesses ramos apareceria.
  const pontos = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0.5, 0.5],
    [0.18, 0.2],
    [0.93, 0.07],
  ] as const;

  for (const rot of ROTACOES) {
    it(`volta ao ponto de partida com /Rotate ${rot}`, () => {
      for (const [u, v] of pontos) {
        const p = paraPdf(u, v, W, H, rot);
        const volta = paraVisual(p, W, H, rot);
        expect(volta.u).toBeCloseTo(u, 9);
        expect(volta.v).toBeCloseTo(v, 9);
      }
    });

    it(`ponto convertido cai DENTRO da MediaBox com /Rotate ${rot}`, () => {
      for (const [u, v] of pontos) {
        const p = paraPdf(u, v, W, H, rot);
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(W + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(H + 1e-6);
      }
    });
  }
});

describe("paraPdf — cantos visuais conhecidos", () => {
  it("sem rotação: topo-esquerdo visual é (0, altura) no PDF (y cresce pra cima)", () => {
    expect(paraPdf(0, 0, W, H, 0)).toEqual({ x: 0, y: H });
    expect(paraPdf(1, 1, W, H, 0)).toEqual({ x: W, y: 0 });
  });

  it("/Rotate 270: topo-esquerdo visual vai pro canto oposto — conferido em prancha real", () => {
    // Foi assim que o spike validou: (0,05 / 0,05) desenhou no topo-esquerdo da tela.
    const p = paraPdf(0, 0, W, H, 270);
    expect(p).toEqual({ x: W, y: H });
    expect(paraPdf(1, 1, W, H, 270)).toEqual({ x: 0, y: 0 });
  });

  it("o centro visual é o centro da página em qualquer rotação", () => {
    for (const rot of ROTACOES) {
      const p = paraPdf(0.5, 0.5, W, H, rot);
      expect(p.x).toBeCloseTo(W / 2);
      expect(p.y).toBeCloseTo(H / 2);
    }
  });

  it("rotações opostas não colidem — 90 e 270 mandam o mesmo ponto pra lugares diferentes", () => {
    const a = paraPdf(0.2, 0.3, W, H, 90);
    const b = paraPdf(0.2, 0.3, W, H, 270);
    expect(a).not.toEqual(b);
  });
});

describe("caixaPdf", () => {
  it("sem rotação, um retângulo visual vira a caixa esperada", () => {
    const c = caixaPdf(0.1, 0.2, 0.4, 0.5, W, H, 0);
    expect(c.x).toBeCloseTo(0.1 * W);
    expect(c.width).toBeCloseTo(0.3 * W);
    expect(c.height).toBeCloseTo(0.3 * H);
    // topo visual 0.2 → y do PDF é o do canto INFERIOR da caixa
    expect(c.y).toBeCloseTo(H - 0.5 * H);
  });

  it("normaliza cantos invertidos (arrasto pra trás)", () => {
    const frente = caixaPdf(0.1, 0.2, 0.4, 0.5, W, H, 0);
    const tras = caixaPdf(0.4, 0.5, 0.1, 0.2, W, H, 0);
    for (const k of ["x", "y", "width", "height"] as const) expect(tras[k]).toBeCloseTo(frente[k]);
  });

  it("em 90/270 os eixos TROCAM: a largura visual consome a altura da MediaBox", () => {
    // O erro que este teste existe pra pegar: escalar a largura visual por `largura` daria
    // uma caixa achatada numa página de um quarto de volta.
    const c = caixaPdf(0.1, 0.2, 0.4, 0.5, W, H, 90);
    expect(c.width).toBeCloseTo(0.3 * W); // veio do eixo v (vertical visual)
    expect(c.height).toBeCloseTo(0.3 * H); // veio do eixo u (horizontal visual)
  });

  it("a área da caixa é a mesma fração da página em qualquer rotação", () => {
    const areaPagina = W * H;
    for (const rot of ROTACOES) {
      const c = caixaPdf(0.1, 0.2, 0.4, 0.5, W, H, rot);
      expect((c.width * c.height) / areaPagina).toBeCloseTo(0.3 * 0.3, 6);
    }
  });
});

describe("anguloTextoEmPe", () => {
  it("é o MESMO sinal da rotação, não o oposto", () => {
    // Confirmado empiricamente na prancha /Rotate 270: `+rot` sai legível, `-rot` de cabeça
    // pra baixo. `/Rotate` gira horário e o pdf-lib gira anti-horário, então se cancelam com
    // o mesmo sinal — a armadilha óbvia aqui é assumir o negativo.
    for (const rot of ROTACOES) expect(anguloTextoEmPe(rot)).toBe(rot);
  });
});

describe("posicaoRotuloCota", () => {
  const LARG = 40; // largura do texto "3,53 m" em pt
  const CORPO = 9;
  const FOLGA = 2;

  /** Cantos da caixa do texto (em pé na leitura `graus`) a partir do início da linha de base. */
  function cantos(p: { x: number; y: number }, graus: number) {
    const t = (graus * Math.PI) / 180;
    const ex = { x: Math.cos(t), y: Math.sin(t) };
    const ey = { x: -Math.sin(t), y: Math.cos(t) };
    const h = CORPO * 0.72;
    return [
      p,
      { x: p.x + ex.x * LARG, y: p.y + ex.y * LARG },
      { x: p.x + ey.x * h, y: p.y + ey.y * h },
      { x: p.x + ex.x * LARG + ey.x * h, y: p.y + ex.y * LARG + ey.y * h },
    ];
  }
  /** Distância com sinal de cada canto à reta da cota. */
  const lado = (a: { x: number; y: number }, b: { x: number; y: number }, q: { x: number; y: number }) => {
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    return ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / c;
  };

  it("cota horizontal: texto acima e centralizado, como antes", () => {
    const p = posicaoRotuloCota({ x: 0, y: 0 }, { x: 100, y: 0 }, LARG, CORPO, 0, FOLGA);
    expect(p.x).toBeCloseTo(50 - LARG / 2);
    expect(p.y).toBeCloseTo(FOLGA);
  });

  it("cota vertical: texto AO LADO (à esquerda), não em cima do traço", () => {
    const p = posicaoRotuloCota({ x: 0, y: 0 }, { x: 0, y: 100 }, LARG, CORPO, 0, FOLGA);
    const xs = cantos(p, 0).map((q) => q.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(-FOLGA + 1e-9);
    // A mesma cota desenhada ao contrário sai no mesmo lugar.
    expect(posicaoRotuloCota({ x: 0, y: 100 }, { x: 0, y: 0 }, LARG, CORPO, 0, FOLGA)).toEqual(p);
  });

  it("em qualquer inclinação e giro de folha, a caixa inteira fica de um lado da cota, com folga", () => {
    for (const graus of [0, 90, 180, 270]) {
      for (let ang = 0; ang < 360; ang += 15) {
        const r = (ang * Math.PI) / 180;
        const a = { x: 500, y: 500 };
        const b = { x: 500 + Math.cos(r) * 120, y: 500 + Math.sin(r) * 120 };
        const d = cantos(posicaoRotuloCota(a, b, LARG, CORPO, graus, FOLGA), graus).map((q) => lado(a, b, q));
        const mesmoLado = d.every((v) => v >= FOLGA - 1e-6) || d.every((v) => v <= -FOLGA + 1e-6);
        expect(mesmoLado, `giro ${graus}°, cota a ${ang}°: ${d.map((v) => v.toFixed(2))}`).toBe(true);
      }
    }
  });
});

