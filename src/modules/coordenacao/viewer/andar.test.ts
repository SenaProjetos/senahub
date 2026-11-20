import { describe, expect, it } from "vitest";
import {
  ALTURA_OLHO_M,
  FATOR_CORRER,
  PITCH_MAXIMO_RAD,
  VELOCIDADE_M_S,
  alvoDoOlhar,
  elementosDoPiso,
  entradaDoAndar,
  maisBaixoParaAndar,
  olhar,
  passoDoAndar,
  pisoPelaCotaMaisFrequente,
  pisoDeEntrada,
  type EstadoAndar,
} from "@/modules/coordenacao/viewer/andar";

const caixa = { min: [-10, 2, 4] as [number, number, number], max: [30, 20, 14] as [number, number, number] };
const parado = (yaw = 0): EstadoAndar => ({ pos: [0, 1.6, 0], yaw, pitch: 0 });
const teclas = (...t: string[]) => new Set(t);
const perto = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("entradaDoAndar", () => {
  it("entra no centro da caixa em planta, com o olho 1,60 m acima do piso, olhando na horizontal", () => {
    const e = entradaDoAndar(caixa, 3.5);
    perto(e.pos, [10, 3.5 + ALTURA_OLHO_M, 9]);
    expect(ALTURA_OLHO_M).toBe(1.6);
    expect(e.pitch).toBe(0);
    const alvo = alvoDoOlhar(e);
    expect(alvo[1]).toBeCloseTo(e.pos[1], 9); // horizontal
  });
});

describe("passoDoAndar", () => {
  it("W por 1 s anda 1,4 m na direção do olhar (yaw), sem mudar a altura", () => {
    for (const yaw of [0, Math.PI / 2, 2.1]) {
      const e = parado(yaw);
      const n = passoDoAndar(e, teclas("KeyW"), 1);
      const alvo = alvoDoOlhar(e);
      const dir = [alvo[0] - e.pos[0], 0, alvo[2] - e.pos[2]];
      perto(n.pos, [e.pos[0] + dir[0] * VELOCIDADE_M_S, e.pos[1], e.pos[2] + dir[2] * VELOCIDADE_M_S]);
      expect(Math.hypot(n.pos[0] - e.pos[0], n.pos[2] - e.pos[2])).toBeCloseTo(1.4, 6);
    }
  });

  it("anda no plano mesmo olhando para cima (o pitch não tira velocidade)", () => {
    const e = { ...parado(0), pitch: 1.2 };
    const n = passoDoAndar(e, teclas("KeyW"), 1);
    expect(n.pos[1]).toBe(e.pos[1]);
    expect(Math.hypot(n.pos[0], n.pos[2])).toBeCloseTo(VELOCIDADE_M_S, 6);
  });

  it("seta para cima = W e S anda para trás", () => {
    const e = parado(0.7);
    perto(passoDoAndar(e, teclas("ArrowUp"), 1).pos, passoDoAndar(e, teclas("KeyW"), 1).pos);
    const tras = passoDoAndar(e, teclas("KeyS"), 1).pos;
    const frente = passoDoAndar(e, teclas("KeyW"), 1).pos;
    perto([tras[0] + frente[0], tras[2] + frente[2]], [0, 0]);
  });

  it("Shift corre 2,5×", () => {
    const n = passoDoAndar(parado(), teclas("KeyW", "ShiftLeft"), 1);
    expect(Math.hypot(n.pos[0], n.pos[2])).toBeCloseTo(VELOCIDADE_M_S * FATOR_CORRER, 6);
    expect(FATOR_CORRER).toBe(2.5);
  });

  it("A/D andam de lado, perpendicular ao olhar (D para a direita)", () => {
    const e = parado(0); // yaw 0 olha para −Z; a direita é +X
    perto(passoDoAndar(e, teclas("KeyD"), 1).pos, [1.4, 1.6, 0]);
    perto(passoDoAndar(e, teclas("KeyA"), 1).pos, [-1.4, 1.6, 0]);
    perto(passoDoAndar(e, teclas("ArrowRight"), 1).pos, [1.4, 1.6, 0]);
    perto(passoDoAndar(e, teclas("KeyW"), 1).pos, [0, 1.6, -1.4]);
  });

  it("diagonal não anda mais rápido que reto", () => {
    const n = passoDoAndar(parado(), teclas("KeyW", "KeyD"), 1);
    expect(Math.hypot(n.pos[0], n.pos[2])).toBeCloseTo(VELOCIDADE_M_S, 6);
  });

  it("Q e Page Up sobem; E e Page Down descem", () => {
    expect(passoDoAndar(parado(), teclas("KeyQ"), 1).pos[1]).toBeCloseTo(1.6 + VELOCIDADE_M_S, 6);
    expect(passoDoAndar(parado(), teclas("PageUp"), 1).pos[1]).toBeCloseTo(1.6 + VELOCIDADE_M_S, 6);
    expect(passoDoAndar(parado(), teclas("KeyE"), 1).pos[1]).toBeCloseTo(1.6 - VELOCIDADE_M_S, 6);
    expect(passoDoAndar(parado(), teclas("PageDown"), 1).pos[1]).toBeCloseTo(1.6 - VELOCIDADE_M_S, 6);
  });

  it("sem tecla nem joystick devolve o mesmo estado (nada a redesenhar)", () => {
    const e = parado();
    expect(passoDoAndar(e, teclas(), 0.5)).toBe(e);
    expect(passoDoAndar(e, teclas("KeyW"), 0)).toBe(e);
    expect(passoDoAndar(e, teclas("KeyW", "KeyS"), 1)).toBe(e);
  });

  it("joystick (0, −1) anda para a frente; (1, 0) para a direita; meio curso anda metade", () => {
    const e = parado(0);
    perto(passoDoAndar(e, teclas(), 1, { x: 0, y: -1 }).pos, [0, 1.6, -1.4]);
    perto(passoDoAndar(e, teclas(), 1, { x: 1, y: 0 }).pos, [1.4, 1.6, 0]);
    perto(passoDoAndar(e, teclas(), 1, { x: 0, y: -0.5 }).pos, [0, 1.6, -0.7]);
  });

  it("joystick somado ao teclado nunca passa da velocidade cheia", () => {
    const n = passoDoAndar(parado(), teclas("KeyW"), 1, { x: 0, y: -1 });
    expect(Math.hypot(n.pos[0], n.pos[2])).toBeCloseTo(VELOCIDADE_M_S, 6);
  });
});

describe("olhar", () => {
  it("gira o yaw e o pitch", () => {
    const e = olhar(parado(), 0.3, 0.2);
    expect(e.yaw).toBeCloseTo(0.3, 9);
    expect(e.pitch).toBeCloseTo(0.2, 9);
  });

  it("o pitch para em ±85°", () => {
    expect(PITCH_MAXIMO_RAD).toBeCloseTo((85 * Math.PI) / 180, 9);
    expect(olhar(parado(), 0, 10).pitch).toBeCloseTo(PITCH_MAXIMO_RAD, 9);
    expect(olhar(parado(), 0, -10).pitch).toBeCloseTo(-PITCH_MAXIMO_RAD, 9);
  });
});

describe("alvoDoOlhar", () => {
  it("é um ponto a 1 m à frente do olho", () => {
    const e: EstadoAndar = { pos: [1, 2, 3], yaw: 0.4, pitch: -0.3 };
    const a = alvoDoOlhar(e);
    expect(Math.hypot(a[0] - 1, a[1] - 2, a[2] - 3)).toBeCloseTo(1, 9);
    expect(a[1]).toBeLessThan(2); // olhando para baixo
  });
});

describe("pisoDeEntrada", () => {
  it("o pavimento mais baixo com piso conhecido", () => {
    expect(pisoDeEntrada([4.2, -1.5, Number.POSITIVE_INFINITY, 0], [caixa])).toBe(-1.5);
  });

  it("sem pavimento, o fundo da caixa da cena", () => {
    expect(pisoDeEntrada([], [caixa, { min: [0, -3, 0], max: [1, 1, 1] }])).toBe(-3);
    expect(pisoDeEntrada([Number.POSITIVE_INFINITY], [caixa])).toBe(2);
  });

  it("sem nada na cena, null", () => {
    expect(pisoDeEntrada([], [])).toBeNull();
  });
});

describe("elementosDoPiso (fundações fora do piso)", () => {
  it("num pavimento misto, tira sapatas, estacas e afins (maiúscula ou minúscula)", () => {
    const els = [
      { localId: 1, category: "IFCSLAB" },
      { localId: 2, category: "IfcFooting" },
      { localId: 3, category: "IFCPILE" },
      { localId: 4, category: "IFCDEEPFOUNDATION" },
      { localId: 5, category: "ifccaissonfoundation" },
      { localId: 6, category: "IFCCOLUMN" },
    ];
    const r = elementosDoPiso(els);
    expect(r.soFundacao).toBe(false);
    expect(r.elementos.map((e) => e.localId)).toEqual([1, 6]);
  });

  it("pavimento só de fundação fica com todos (é o piso dele)", () => {
    const els = [
      { localId: 1, category: "IFCFOOTING" },
      { localId: 2, category: "IFCPILE" },
    ];
    const r = elementosDoPiso(els);
    expect(r.soFundacao).toBe(true);
    expect(r.elementos.map((e) => e.localId)).toEqual([1, 2]);
  });

  it("sem categoria conta como elemento comum", () => {
    const r = elementosDoPiso([{ localId: 1, category: null }, { localId: 2 }]);
    expect(r.soFundacao).toBe(false);
    expect(r.elementos).toHaveLength(2);
  });
});

describe("maisBaixoParaAndar", () => {
  it("pula o pavimento só de fundação", () => {
    const fundacao = { nome: "FUNDAÇÃO", pisoY: -2, soFundacao: true };
    const terreo = { nome: "TÉRREO", pisoY: 0, soFundacao: false };
    const superior = { nome: "SUPERIOR", pisoY: 3, soFundacao: false };
    expect(maisBaixoParaAndar([superior, fundacao, terreo])).toBe(terreo);
  });

  it("só fundação: o mais baixo deles; piso desconhecido não entra; vazio = null", () => {
    const a = { pisoY: -2, soFundacao: true };
    const b = { pisoY: -1, soFundacao: true };
    expect(maisBaixoParaAndar([b, a])).toBe(a);
    expect(maisBaixoParaAndar([{ pisoY: Number.POSITIVE_INFINITY, soFundacao: false }, b])).toBe(b);
    expect(maisBaixoParaAndar([])).toBeNull();
  });
});

describe("pisoPelaCotaMaisFrequente", () => {
  it("poucos arranques a −1,10 e muitas paredes/pilares a 0,00 → 0,00", () => {
    expect(pisoPelaCotaMaisFrequente([-1.1, -1.1, 0, 0, 0, 0, 0, 2.88])).toBe(0);
  });

  it("empate fica com a faixa mais baixa", () => {
    expect(pisoPelaCotaMaisFrequente([3, 3, 0, 0, 1.5])).toBe(0);
    expect(pisoPelaCotaMaisFrequente([0, 0, 3, 3])).toBe(0);
  });

  it("com menos de 3 bases, o menor", () => {
    expect(pisoPelaCotaMaisFrequente([2, -1])).toBe(-1);
    expect(pisoPelaCotaMaisFrequente([5])).toBe(5);
  });

  it("ruído de ±2 cm cai na mesma faixa; o piso é a menor base dela", () => {
    expect(pisoPelaCotaMaisFrequente([-0.02, 0.01, 0.02, -0.01, 1.2, 1.2, 1.21])).toBe(-0.02);
  });

  it("ignora base inválida; sem nenhuma, +Infinity", () => {
    expect(pisoPelaCotaMaisFrequente([Number.NaN, Number.POSITIVE_INFINITY, 0, 0, 0])).toBe(0);
    expect(pisoPelaCotaMaisFrequente([])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("elementosDoPiso + pisoPelaCotaMaisFrequente (piso pelos pilares e paredes)", () => {
  type El = { localId: number; category: string; base: number };
  const piso = (els: El[]) => pisoPelaCotaMaisFrequente(elementosDoPiso(els).elementos.map((e) => e.base));
  let id = 0;
  const n = (qtd: number, category: string, base: number): El[] =>
    Array.from({ length: qtd }, () => ({ localId: ++id, category, base }));

  it("108 baldrames a −0,30 + 29 pilares a 0,00 + 1 parede → 0,00 (só os verticais contam)", () => {
    const els = [...n(108, "IFCBEAM", -0.3), ...n(29, "IfcColumn", 0), ...n(1, "IFCWALLSTANDARDCASE", 0), ...n(58, "IFCFOOTING", -1.8)];
    const r = elementosDoPiso(els);
    expect(r.elementos.every((e) => /COLUMN|WALL/i.test(e.category))).toBe(true);
    expect(piso(els)).toBe(0);
  });

  it("todas as categorias verticais contam", () => {
    const els = [...n(1, "IFCWALL", 0), ...n(1, "IFCWALLELEMENTEDCASE", 0), ...n(1, "ifccurtainwall", 0), ...n(5, "IFCBEAM", -0.3)];
    expect(elementosDoPiso(els).elementos).toHaveLength(3);
    expect(piso(els)).toBe(0);
  });

  it("com menos de 3 verticais, vale a regra geral (sem fundações, cota mais frequente)", () => {
    const els = [...n(10, "IFCBEAM", -0.3), ...n(2, "IFCCOLUMN", 0), ...n(3, "IFCPILE", -5)];
    const r = elementosDoPiso(els);
    expect(r.elementos).toHaveLength(12);
    expect(r.soFundacao).toBe(false);
    expect(piso(els)).toBe(-0.3);
  });

  it("pavimento só de fundação continua com todos", () => {
    const els = [...n(2, "IFCFOOTING", -1.8), ...n(2, "IFCPILE", -6)];
    const r = elementosDoPiso(els);
    expect(r.soFundacao).toBe(true);
    expect(r.elementos).toHaveLength(4);
  });
});
