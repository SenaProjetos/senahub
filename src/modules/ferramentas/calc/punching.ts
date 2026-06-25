/**
 * Engine E07 — Punção em laje lisa (NBR 6118:2023, §19.5).
 * Puro. Dimensões em cm, força em kN, momento em kN·m, tensões internas em kN/cm² (×10 → MPa).
 *
 * Pilares interno, de borda e de canto. Perímetros de controle:
 *  - C  (contorno do pilar): u0
 *  - C' (a 2d do pilar): u1
 * Verificações: τSd ≤ τRd2 (biela, 19.5.3.1) em C; τSd ≤ τRd1 (sem armadura, 19.5.3.2) em C'.
 * Se exceder, dimensiona armadura de punção (estribos, 19.5.3.3) e localiza C'' (uout) onde a
 * armadura não é mais necessária.
 *
 * Coeficiente β (efeito de momento, 19.5.2.2): β = 1 + K·MSd·u1/(Wp·FSd), com K da Tabela 19.2
 * (c1/c2) e Wp = ∫|e|dl (módulo plástico) integrado sobre o perímetro C' — definição que reproduz
 * a fórmula fechada da NBR para pilar interno. Para borda/canto usa o perímetro reduzido derivado.
 */

import { z } from "zod";

const ES_FYK = { "CA-25": 250, "CA-50": 500, "CA-60": 600 } as const;

export const POSICOES = {
  interno: "Pilar interno",
  borda: "Pilar de borda",
  canto: "Pilar de canto",
} as const;
export type Posicao = keyof typeof POSICOES;

export const entradaSchema = z.object({
  posicao: z.enum(["interno", "borda", "canto"]),
  c1: z.number().positive(), // cm — dimensão do pilar na direção do momento (perpend. à borda, p/ borda/canto)
  c2: z.number().positive(), // cm — dimensão perpendicular
  d: z.number().positive(), // cm — altura útil da laje
  fck: z.number().min(20).max(90), // MPa
  fSd: z.number().positive(), // kN — força de punção de cálculo
  mSd: z.number().min(0).default(0), // kN·m — momento de cálculo transferido
  rhoX: z.number().positive().default(0.5), // % — taxa de armadura de flexão (dir. x)
  rhoY: z.number().positive().default(0.5), // % — taxa (dir. y)
  acoPuncao: z.enum(["CA-25", "CA-50", "CA-60"]).default("CA-50"),
  sr: z.number().positive().default(0), // cm — espaçamento radial dos estribos (0 → 0,75d)
});

export type EntradaPuncao = z.infer<typeof entradaSchema>;
export type EntradaPuncaoInput = z.input<typeof entradaSchema>;

/** Coeficiente K (Tabela 19.2) por c1/c2, interpolado. */
export function coefK(c1: number, c2: number): number {
  const r = c1 / c2;
  const tab: [number, number][] = [[0.5, 0.45], [1.0, 0.6], [2.0, 0.7], [3.0, 0.8]];
  if (r <= tab[0][0]) return tab[0][1];
  if (r >= tab[tab.length - 1][0]) return tab[tab.length - 1][1];
  for (let i = 0; i < tab.length - 1; i++) {
    if (r >= tab[i][0] && r <= tab[i + 1][0]) {
      const t = (r - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
      return tab[i][1] + t * (tab[i + 1][1] - tab[i][1]);
    }
  }
  return 0.8;
}

type Ponto = { x: number; y: number };

/** Pontos do perímetro C' (a `dist` do pilar) por posição. x é a direção do momento. */
function perimetroC1(posicao: Posicao, c1: number, c2: number, dist: number): Ponto[] {
  const pts: Ponto[] = [];
  const arco = (cx: number, cy: number, a0: number, a1: number) => {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push({ x: cx + dist * Math.cos(a), y: cy + dist * Math.sin(a) });
    }
  };
  const h1 = c1 / 2;
  const h2 = c2 / 2;
  const P = Math.PI;
  if (posicao === "interno") {
    pts.push({ x: -h1, y: h2 + dist });
    pts.push({ x: h1, y: h2 + dist });
    arco(h1, h2, P / 2, 0);
    pts.push({ x: h1 + dist, y: -h2 });
    arco(h1, -h2, 0, -P / 2);
    pts.push({ x: -h1, y: -h2 - dist });
    arco(-h1, -h2, -P / 2, -P);
    pts.push({ x: -h1 - dist, y: h2 });
    arco(-h1, h2, P, P / 2);
  } else if (posicao === "borda") {
    // Pilar em x∈[0,c1], y∈[-h2,h2]; borda em x=0. Perímetro no lado da laje (x>0).
    pts.push({ x: 0, y: h2 + dist });
    pts.push({ x: c1, y: h2 + dist });
    arco(c1, h2, P / 2, 0);
    pts.push({ x: c1 + dist, y: -h2 });
    arco(c1, -h2, 0, -P / 2);
    pts.push({ x: 0, y: -h2 - dist });
  } else {
    // Canto: pilar em x∈[0,c1], y∈[0,c2]; bordas em x=0 e y=0.
    pts.push({ x: 0, y: c2 + dist });
    pts.push({ x: c1, y: c2 + dist });
    arco(c1, c2, P / 2, 0);
    pts.push({ x: c1 + dist, y: 0 });
  }
  return pts;
}

/**
 * Comprimento, centroide-x e módulo plástico Wp = ∫|x−x̄|dl do perímetro.
 * Cada trecho é subdividido (|x−x̄| varia em "V" ao cruzar o eixo — ponto médio do trecho inteiro
 * subestimaria a integral).
 */
function propsPerimetro(pts: Ponto[]): { u: number; xbar: number; wp: number } {
  const SUB = 20;
  let u = 0;
  let sx = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dl = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const xm = (pts[i].x + pts[i + 1].x) / 2;
    u += dl;
    sx += xm * dl;
  }
  const xbar = u > 0 ? sx / u : 0;
  let wp = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dl = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) / SUB;
    for (let j = 0; j < SUB; j++) {
      const t = (j + 0.5) / SUB;
      const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
      wp += Math.abs(x - xbar) * dl;
    }
  }
  return { u, xbar, wp };
}

/** u0 (contorno do pilar adjacente à laje) por posição. */
function u0De(posicao: Posicao, c1: number, c2: number): number {
  if (posicao === "interno") return 2 * (c1 + c2);
  if (posicao === "borda") return 2 * c1 + c2;
  return c1 + c2; // canto
}

/** fywd da armadura de punção (kN/cm²): estribos 250→435 MPa p/ d=15→35 cm, ≤ fyd. */
function fywdPuncao(d: number, fyk: number): number {
  const fyd = fyk / 1.15; // MPa
  const lim = Math.min(435, Math.max(250, 250 + (435 - 250) * (d - 15) / 20));
  return Math.min(fyd, lim) / 10; // kN/cm²
}

export type ResultadoPuncao = {
  u0: number; // cm
  u1: number; // cm
  wp: number; // cm²
  k: number;
  beta: number;
  // Tensões (MPa):
  tauSd0: number;
  tauRd2: number;
  okBiela: boolean;
  tauSd1: number;
  tauRd1: number;
  precisaArmadura: boolean;
  // Armadura (quando necessária):
  asw: number; // cm² por perímetro
  sr: number; // cm
  uout: number; // cm — perímetro onde τSd = τRd1
  distC2: number; // cm — distância do pilar até C''
  situacao: "ok" | "armar" | "revisar";
  alertas: string[];
};

export function calcular(input: EntradaPuncaoInput): ResultadoPuncao {
  const v = entradaSchema.parse(input);
  const dist = 2 * v.d;
  const u0 = u0De(v.posicao, v.c1, v.c2);
  const { u: u1, wp } = propsPerimetro(perimetroC1(v.posicao, v.c1, v.c2, dist));

  const k = coefK(v.c1, v.c2);
  const mSdKNcm = v.mSd * 100;
  const beta = 1 + (k * mSdKNcm * u1) / (wp * v.fSd);

  const fcd = v.fck / 10 / 1.4; // kN/cm²
  const alphaV = 1 - v.fck / 250;
  const rho = Math.min(Math.sqrt((v.rhoX / 100) * (v.rhoY / 100)), 0.02);
  const xi = 1 + Math.sqrt(20 / v.d);
  const fckTerm = Math.cbrt(100 * rho * v.fck); // (100ρfck)^(1/3)

  // kN/cm² (formulas em MPa → /10).
  const tauRd2 = 0.27 * alphaV * fcd;
  const tauRd1 = (0.13 * xi * fckTerm) / 10;
  const tauSd0 = (beta * v.fSd) / (u0 * v.d);
  const tauSd1 = (beta * v.fSd) / (u1 * v.d);

  const okBiela = tauSd0 <= tauRd2;
  const precisaArmadura = tauSd1 > tauRd1;

  const alertas: string[] = [];
  let situacao: "ok" | "armar" | "revisar" = "ok";
  if (!okBiela) {
    situacao = "revisar";
    alertas.push("Esmagamento da biela (τSd > τRd2 em C): aumentar a seção do pilar, a altura da laje ou o fck.");
  }

  let asw = 0;
  let uout = u1;
  let distC2 = dist;
  const sr = v.sr > 0 ? v.sr : 0.75 * v.d;
  if (precisaArmadura) {
    if (situacao === "ok") situacao = "armar";
    const tauC = (0.10 * xi * fckTerm) / 10; // parcela do concreto com armadura (kN/cm²)
    const fywd = fywdPuncao(v.d, ES_FYK[v.acoPuncao]);
    asw = ((tauSd1 - tauC) * u1 * sr) / (1.5 * fywd); // cm² por perímetro
    if (asw < 0) asw = 0;
    // C'': perímetro onde τSd ≤ τRd1 → uout = β·FSd/(τRd1·d).
    uout = (beta * v.fSd) / (tauRd1 * v.d);
    // distância radial p/ pilar interno: uout = 2(c1+c2) + 2π·dist'' (aprox.).
    distC2 = Math.max(dist, (uout - 2 * (v.c1 + v.c2)) / (2 * Math.PI));
  }

  return {
    u0,
    u1,
    wp,
    k,
    beta,
    tauSd0: tauSd0 * 10,
    tauRd2: tauRd2 * 10,
    okBiela,
    tauSd1: tauSd1 * 10,
    tauRd1: tauRd1 * 10,
    precisaArmadura,
    asw,
    sr,
    uout,
    distC2,
    situacao,
    alertas,
  };
}
