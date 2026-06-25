/**
 * Engine E22 — Sapatas excêntricas (NBR 6118:2023 / NBR 6122).
 * Puro. Cargas kN, momentos kN·m, σ em kPa (kN/m²), dimensões cm, armadura cm².
 *
 * Dois modos:
 *  A) "isolada": sapata com carga excêntrica (momento na base). e = M/N. Tensões no solo:
 *     - e ≤ a/6 (núcleo central): trapezoidal, σmax/min = N/A·(1 ± 6e/a).
 *     - e > a/6: triangular com descolamento, σmax = 2N/(3·b·(a/2−e)).
 *  B) "viga_equilibrio": pilar na divisa (P1, excêntrico) ligado por viga de equilíbrio (alavanca)
 *     a um pilar interno (P2). Centroide da sapata de divisa deslocado e=(a1−ap1)/2 do eixo do pilar.
 *     R1 = P1·ℓ/(ℓ−e); R2 = P2 − (R1−P1); M_viga = R1·e (couple). Dimensiona as 2 sapatas + a viga.
 *
 * Reusa: calcularViga (E01) para a flexão da viga de equilíbrio; calcularSapata (E21) p/ a sapata interna.
 */

import { z } from "zod";
import { ACOS } from "./concrete-beam-flexure";
import { calcular as calcularViga } from "./concrete-beam-flexure";
import { calcular as calcularSapata } from "./footing";
import { armaduraFaixa } from "./slab-bares";

const acoEnum = z.enum(["CA-25", "CA-50", "CA-60"]);

const isoladaSchema = z.object({
  modo: z.literal("isolada"),
  nk: z.number().positive(), // kN
  mk: z.number().min(0).default(0), // kN·m (momento na base)
  a: z.number().positive(), // cm — dimensão da base na direção do momento
  b: z.number().positive(), // cm — dimensão perpendicular
  ap: z.number().positive(), // cm — pilar (dir. a)
  sigmaAdm: z.number().positive(), // kPa
  h: z.number().positive(), // cm
  fck: z.number().min(20).max(90),
  aco: acoEnum,
  dLinha: z.number().positive().default(5),
});

const vigaSchema = z.object({
  modo: z.literal("viga_equilibrio"),
  p1: z.number().positive(), // kN — pilar de divisa
  p2: z.number().positive(), // kN — pilar interno
  ell: z.number().positive(), // cm — distância entre eixos dos pilares
  ap1: z.number().positive(), // cm — pilar de divisa (dir. da viga)
  a1: z.number().positive(), // cm — comprimento da sapata de divisa (p/ dentro)
  sigmaAdm: z.number().positive(), // kPa
  fck: z.number().min(20).max(90),
  aco: acoEnum,
  bwViga: z.number().positive().default(30), // cm — largura da viga de equilíbrio
  hViga: z.number().positive().default(60), // cm — altura da viga
});

export const entradaSchema = z.discriminatedUnion("modo", [isoladaSchema, vigaSchema]);
export type EntradaExc = z.infer<typeof entradaSchema>;
export type EntradaExcInput = z.input<typeof entradaSchema>;

export type ResultadoIsolada = {
  modo: "isolada";
  e: number; // cm
  emax: number; // cm (a/6)
  descola: boolean;
  sigmaMax: number; // kPa
  sigmaMin: number; // kPa
  sigmaOk: boolean;
  asA: number; // cm²/m
  alertas: string[];
  situacao: "ok" | "revisar";
};

export type ResultadoViga = {
  modo: "viga_equilibrio";
  e: number; // cm
  r1: number; // kN (reação na sapata de divisa)
  r2: number; // kN (reação na sapata interna)
  deltaP2: number; // kN (alívio na interna)
  mViga: number; // kN·m (momento de cálculo da viga)
  vViga: number; // kN (cortante)
  asViga: number; // cm² (armadura de flexão da viga)
  // Sapata de divisa (a1 dado, b1 calculado):
  b1: number; // cm
  sigma1: number; // kPa
  // Sapata interna (via E21):
  a2: number; // cm
  b2: number; // cm
  sigma2: number; // kPa
  as2porM: number; // cm²/m
  alertas: string[];
  situacao: "ok" | "revisar";
};

export type ResultadoExc = ResultadoIsolada | ResultadoViga;

function arred5(cm: number): number {
  return Math.ceil(cm / 5) * 5;
}

export function calcular(input: EntradaExcInput): ResultadoExc {
  const v = entradaSchema.parse(input);
  if (v.modo === "isolada") return calcularIsolada(v);
  return calcularViga2(v);
}

function calcularIsolada(v: z.infer<typeof isoladaSchema>): ResultadoIsolada {
  const alertas: string[] = [];
  const e = v.mk / v.nk * 100; // cm (M/N → m → cm)
  const emax = v.a / 6;
  const aM = v.a / 100;
  const bM = v.b / 100;
  const area = aM * bM;
  const descola = e > emax;

  let sigmaMax: number;
  let sigmaMin: number;
  if (!descola) {
    const eM = e / 100;
    sigmaMax = (v.nk / area) * (1 + (6 * eM) / aM);
    sigmaMin = (v.nk / area) * (1 - (6 * eM) / aM);
  } else {
    // Triangular: comprimento de contato x = 3·(a/2 − e). σmax = 2N/(b·x).
    const xM = 3 * (aM / 2 - e / 100);
    sigmaMax = xM > 0 ? (2 * v.nk) / (bM * xM) : Infinity;
    sigmaMin = 0;
    alertas.push(`Excentricidade e (${e.toFixed(1)} cm) > a/6 (${emax.toFixed(1)} cm): há descolamento (diagrama triangular).`);
  }
  const sigmaOk = sigmaMax <= v.sigmaAdm * 1.001;
  if (!sigmaOk) alertas.push(`σmax (${sigmaMax.toFixed(0)} kPa) > σadm (${v.sigmaAdm} kPa): aumentar a base ou reduzir a excentricidade.`);

  // Armadura: flexão no balanço com a pressão do lado mais carregado (conservador), σ de cálculo.
  const d = v.h - v.dLinha;
  const fyd = ACOS[v.aco] / 10 / 1.15;
  const balanco = (v.a - v.ap) / 2 / 100; // m
  const sigmaD = 1.4 * sigmaMax; // kPa de cálculo (lado mais carregado)
  const mPorM = (sigmaD * balanco * balanco) / 2; // kN·m/m
  const arm = armaduraFaixa(mPorM, d, v.fck, fyd, 1);
  const asA = Math.max(arm.as, (0.15 / 100) * (100 * v.h));

  return {
    modo: "isolada",
    e,
    emax,
    descola,
    sigmaMax,
    sigmaMin,
    sigmaOk,
    asA,
    alertas,
    situacao: sigmaOk && !arm.excede ? "ok" : "revisar",
  };
}

function calcularViga2(v: z.infer<typeof vigaSchema>): ResultadoViga {
  const alertas: string[] = [];
  const e = (v.a1 - v.ap1) / 2; // cm — deslocamento do centroide da sapata1
  const ellM = v.ell / 100;
  const eM = e / 100;
  if (eM >= ellM) {
    alertas.push("e ≥ ℓ: geometria inválida (sapata de divisa muito longa para o vão).");
  }
  const r1 = (v.p1 * ellM) / (ellM - eM); // kN
  const deltaP2 = r1 - v.p1; // kN
  const r2 = v.p2 - deltaP2; // kN
  if (r2 < 0) alertas.push("R2 < 0: a sapata interna sofre tração (levantamento) — revisar a geometria/cargas.");

  const mViga = r1 * eM; // kN·m (couple = R1·e)
  const vViga = deltaP2; // kN (força transferida pela viga)

  // Sapata de divisa: a1 dado, b1 p/ R1 (concêntrica em R1, com ~5% peso próprio).
  const areaReq1 = (r1 * 1.05) / v.sigmaAdm; // m²
  const a1M = v.a1 / 100;
  let b1 = arred5((areaReq1 / a1M) * 100); // cm
  b1 = Math.max(b1, v.ap1 + 10);
  const sigma1 = (r1 * 1.05) / (a1M * (b1 / 100));
  if (sigma1 > v.sigmaAdm * 1.001) alertas.push(`σ1 (${sigma1.toFixed(0)} kPa) > σadm — aumentar a sapata de divisa.`);

  // Sapata interna: via E21 (concêntrica, carga R2).
  const hSap2 = Math.max(30, arred5(v.ap1));
  const sap2 = calcularSapata({
    nk: Math.max(r2, 1),
    sigmaAdm: v.sigmaAdm,
    ap: v.ap1,
    bp: v.ap1,
    h: hSap2,
    fck: v.fck,
    aco: v.aco,
  });

  // Viga de equilíbrio: flexão (reusa E01). Md = 1,4·Mviga (Mk característico).
  const fyd = ACOS[v.aco] / 10 / 1.15;
  void fyd;
  const dViga = v.hViga - 5;
  let asViga = 0;
  try {
    const rv = calcularViga({
      secao: { forma: "retangular", b: v.bwViga, h: v.hViga },
      d: dViga,
      fck: v.fck,
      aco: v.aco,
      Mk: Math.max(mViga, 0.01),
      gamaF: 1.4,
    });
    asViga = rv.As + rv.AsLinha;
    if (rv.situacao === "revisar") alertas.push("Viga de equilíbrio: seção insuficiente à flexão — aumentar bw/h.");
  } catch {
    alertas.push("Não foi possível dimensionar a viga (verificar bw/h).");
  }

  const situacao: "ok" | "revisar" =
    alertas.some((x) => x.includes(">") || x.includes("tração") || x.includes("inválida") || x.includes("insuficiente"))
      ? "revisar"
      : "ok";

  return {
    modo: "viga_equilibrio",
    e,
    r1,
    r2,
    deltaP2,
    mViga,
    vViga,
    asViga,
    b1,
    sigma1,
    a2: sap2.a,
    b2: sap2.b,
    sigma2: sap2.sigmaSolo,
    as2porM: sap2.asAporM,
    alertas,
    situacao,
  };
}
