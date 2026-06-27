/**
 * Engine E08 — Escada de lance reto (com patamar) — NBR 6118:2023.
 * Puro. Dimensões em cm, cargas em kN/m², momentos em kN·m/m, armadura em cm²/m.
 *
 * Modela a escada como uma viga horizontal de vão L = projeção do lance + patamar, faixa de 1 m,
 * com carga uniforme no trecho do lance (w_lance) e no patamar (w_pat). Resolve o diagrama de
 * momentos para a vinculação escolhida (biapoiado, engastado-apoiado, biengastado) pelo método
 * das forças (momentos de extremidade por compatibilidade de rotações, EI constante).
 *
 * Carga do lance (por m² de projeção horizontal): laje inclinada γc·hl/cosα + degraus γc·e/2 +
 * revestimento; patamar: γc·hl + revestimento. Sobrecarga q conforme NBR 6120.
 * Flecha imediata estimada por carga uniforme equivalente (coeficiente por vinculação) com Ieq de Branson.
 */

import { z } from "zod";
import { ACOS } from "./concrete-beam-flexure";
import { armaduraFaixa } from "./slab-bares";
import { moduloSecante } from "./concrete-beam-deflection";

const GAMA_C = 25; // kN/m³ (concreto armado)
const ES = 21000; // kN/cm²

export const VINCULACOES = {
  biapoiado: "Biapoiado (apoios simples nas extremidades)",
  engastado_apoiado: "Engastado-apoiado (1 extremidade engastada)",
  biengastado: "Biengastado (2 extremidades engastadas)",
} as const;
export type Vinculacao = keyof typeof VINCULACOES;

export const entradaSchema = z.object({
  piso: z.number().positive(), // cm — pegada do degrau (g)
  espelho: z.number().positive(), // cm — altura do degrau (e)
  aLance: z.number().positive(), // cm — projeção horizontal do lance
  aPatamar: z.number().min(0).default(0), // cm — comprimento do patamar
  hLaje: z.number().positive(), // cm — espessura da laje (waist)
  revest: z.number().min(0).default(1), // kN/m² — revestimento
  q: z.number().min(0).default(3), // kN/m² — sobrecarga (NBR 6120; escadas 2,5–3,0)
  fck: z.number().min(20).max(90),
  aco: z.enum(["CA-25", "CA-50", "CA-60"]),
  vinculacao: z.enum(["biapoiado", "engastado_apoiado", "biengastado"]).default("biapoiado"),
  dLinha: z.number().positive().default(2.5), // cm — cobrimento ao CG
  alphaE: z.number().positive().default(1.0),
  alphaF: z.number().min(0).default(1.32),
});

export type EntradaEscada = z.infer<typeof entradaSchema>;
export type EntradaEscadaInput = z.input<typeof entradaSchema>;

export type ResultadoEscada = {
  alphaGraus: number; // inclinação (°)
  gLance: number; // kN/m² (permanente do lance)
  gPatamar: number; // kN/m²
  wLance: number; // kN/m (faixa de 1 m)
  wPatamar: number; // kN/m
  L: number; // m (vão total horizontal)
  ra: number; // kN/m (reação A)
  rb: number; // kN/m (reação B)
  mVaoMax: number; // kN·m/m (momento positivo máximo)
  mApoioMax: number; // kN·m/m (momento negativo de apoio, módulo)
  asVao: number; // cm²/m
  asApoio: number; // cm²/m
  asMin: number; // cm²/m
  flechaImediata: number; // cm
  flechaTotal: number; // cm
  flechaLimite: number; // cm
  alertas: string[];
};

/** As,mín de laje/escada armada em uma direção = ρmín·Ac (NBR 6118 Tab. 19.1). */
function asMinEscada(fck: number, h: number): number {
  const tabela: [number, number][] = [
    [20, 0.15], [25, 0.15], [30, 0.15], [35, 0.164], [40, 0.179], [45, 0.194],
    [50, 0.208], [55, 0.211], [60, 0.219], [65, 0.226], [70, 0.233], [75, 0.239],
    [80, 0.245], [85, 0.251], [90, 0.256],
  ];
  let rho = 0.15;
  if (fck >= tabela[tabela.length - 1][0]) rho = tabela[tabela.length - 1][1];
  else for (let i = 0; i < tabela.length - 1; i++) {
    const [f0, r0] = tabela[i];
    const [f1, r1] = tabela[i + 1];
    if (fck >= f0 && fck <= f1) { rho = r0 + ((r1 - r0) * (fck - f0)) / (f1 - f0); break; }
  }
  return (rho / 100) * (100 * h);
}

/** Coeficiente de flecha por carga uniforme (δ = coef·w·L⁴/(EI)). */
const COEF_FLECHA: Record<Vinculacao, number> = {
  biapoiado: 5 / 384,
  engastado_apoiado: 1 / 185, // ≈ 2,08/384
  biengastado: 1 / 384,
};

export function calcular(input: EntradaEscadaInput): ResultadoEscada {
  const v = entradaSchema.parse(input);
  const eM = v.espelho / 100;
  const hM = v.hLaje / 100;
  const cosA = v.piso / Math.hypot(v.piso, v.espelho);
  const alphaGraus = (Math.atan2(v.espelho, v.piso) * 180) / Math.PI;

  // Cargas (kN/m²).
  const gLance = (GAMA_C * hM) / cosA + GAMA_C * (eM / 2) + v.revest;
  const gPatamar = GAMA_C * hM + v.revest;
  const wLance = gLance + v.q; // kN/m (faixa de 1 m)
  const wPatamar = gPatamar + v.q;

  const a1 = v.aLance / 100; // m (lance)
  const a2 = v.aPatamar / 100; // m (patamar, no fim)
  const L = a1 + a2;

  // Reações (simplesmente apoiado) — patamar no trecho [a1, L].
  const ra = (wLance * a1 * (L - a1 / 2) + wPatamar * a2 * (a2 / 2)) / L;
  const W = wLance * a1 + wPatamar * a2;
  const rb = W - ra;

  // M0(x) simplesmente apoiado.
  const m0 = (x: number): number => {
    if (x <= a1) return ra * x - (wLance * x * x) / 2;
    return ra * x - wLance * a1 * (x - a1 / 2) - (wPatamar * (x - a1) ** 2) / 2;
  };

  // Amostragem + integrais ∫M0·(1−x/L) e ∫M0·(x/L) (trapézio).
  const N = 400;
  const dx = L / N;
  let i1 = 0;
  let i2 = 0;
  const xs: number[] = [];
  const m0s: number[] = [];
  for (let k = 0; k <= N; k++) {
    const x = k * dx;
    const m = m0(x);
    xs.push(x);
    m0s.push(m);
    const peso = k === 0 || k === N ? 0.5 : 1;
    i1 += peso * m * (1 - x / L) * dx;
    i2 += peso * m * (x / L) * dx;
  }

  // Momentos de extremidade por compatibilidade (M(x)=M0+MA(1−x/L)+MB(x/L)).
  let mA = 0;
  let mB = 0;
  if (v.vinculacao === "biengastado") {
    // [L/3 L/6; L/6 L/3]·[MA;MB] = [−i1; −i2]
    const a = L / 3, b = L / 6;
    const det = a * a - b * b;
    mA = (-i1 * a - -i2 * b) / det; // (a·(−i1) − b·(−i2))/det
    mB = (a * -i2 - b * -i1) / det;
  } else if (v.vinculacao === "engastado_apoiado") {
    mA = (-i1 * 3) / L; // MB = 0
  }

  let mVaoMax = 0;
  for (let k = 0; k <= N; k++) {
    const m = m0s[k] + mA * (1 - xs[k] / L) + mB * (xs[k] / L);
    if (m > mVaoMax) mVaoMax = m;
  }
  const mApoioMax = Math.max(Math.abs(mA), Math.abs(mB));

  // Armaduras (flexão simples, faixa de 1 m).
  const fyd = ACOS[v.aco] / 10 / 1.15;
  const d = v.hLaje - v.dLinha;
  const asMin = asMinEscada(v.fck, v.hLaje);
  const armV = armaduraFaixa(mVaoMax, d, v.fck, fyd, 1.4);
  const armA = mApoioMax > 0 ? armaduraFaixa(mApoioMax, d, v.fck, fyd, 1.4) : { as: 0, xd: 0, excede: false };
  const asVao = Math.max(armV.as, asMin);
  const asApoio = mApoioMax > 0 ? Math.max(armA.as, asMin) : 0;

  const alertas: string[] = [];
  if (armV.excede) alertas.push("Momento de vão excede o limite de ductilidade — aumentar a espessura.");

  // Flecha (carga uniforme equivalente + Branson na seção de vão).
  const ecs = moduloSecante(v.fck, v.alphaE); // MPa
  const ecsKNcm2 = ecs / 10; // kN/cm²
  const ic = (100 * v.hLaje ** 3) / 12;
  const fctm = (v.fck <= 50 ? 0.3 * Math.pow(v.fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * v.fck)) / 10;
  const mr = (1.5 * fctm * ic) / (v.hLaje / 2); // kN·cm
  const maServ = (mVaoMax / 1.4) * 100; // serviço aprox. (kN·cm) — Mk = Md/γf
  const alphaEs = ES / ecsKNcm2;
  const xII = (-alphaEs * asVao + Math.sqrt((alphaEs * asVao) ** 2 + 2 * 100 * alphaEs * asVao * d)) / 100;
  const iII = (100 * xII ** 3) / 3 + alphaEs * asVao * (d - xII) ** 2;
  const razao = maServ > 0 ? Math.min(mr / maServ, 1) : 1;
  const ieq = maServ > mr ? Math.min(razao ** 3 * ic + (1 - razao ** 3) * iII, ic) : ic;

  const wEq = W / L; // kN/m equivalente
  const Lcm = L * 100;
  const flechaImediata = (COEF_FLECHA[v.vinculacao] * wEq / 100 * Lcm ** 4) / (ecsKNcm2 * ieq); // cm (wEq/100 → kN/cm)
  const flechaTotal = flechaImediata * (1 + v.alphaF);
  const flechaLimite = Lcm / 250;
  if (flechaTotal > flechaLimite) alertas.push(`Flecha total (${flechaTotal.toFixed(2)} cm) excede L/250 (${flechaLimite.toFixed(2)} cm).`);

  return {
    alphaGraus,
    gLance,
    gPatamar,
    wLance,
    wPatamar,
    L,
    ra,
    rb,
    mVaoMax,
    mApoioMax,
    asVao,
    asApoio,
    asMin,
    flechaImediata,
    flechaTotal,
    flechaLimite,
    alertas,
  };
}
