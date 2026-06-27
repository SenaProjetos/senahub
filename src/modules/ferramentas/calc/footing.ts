/**
 * Engine E21 — Sapata isolada (NBR 6118:2023 §22.6 + NBR 6122).
 * Puro. Cargas em kN, σ em kPa (kN/m²), dimensões em cm, armadura em cm².
 *
 * Procedimento:
 *  1. Área da base pela tensão admissível (abas iguais: a−ap = b−bp); checa σsolo ≤ σadm.
 *  2. Classifica a rigidez: rígida se h ≥ (a−ap)/3 e h ≥ (b−bp)/3 (22.6.1).
 *  3. Rígida → armadura por bielas-tirantes: T = Nd·(a−ap)/(8·d); As = T/fyd (22.6.2).
 *     Flexível → flexão em balanço na face do pilar (M = σd·ℓ²/2) + verificação à punção (22.6.3,
 *     reusando o engine E07). σ estrutural = Nd/(a·b) (peso próprio é equilibrado, não flete).
 *
 * Sapata centrada (sem momento). Excêntricas/viga de equilíbrio → ferramenta E22.
 */

import { z } from "zod";
import { ACOS } from "./concrete-beam-flexure";
import { armaduraFaixa } from "./slab-bares";
import { calcular as calcularPuncao, type ResultadoPuncao } from "./punching";

export const entradaSchema = z.object({
  nk: z.number().positive(), // kN — carga característica do pilar
  sigmaAdm: z.number().positive(), // kPa — tensão admissível do solo
  ap: z.number().positive(), // cm — dimensão do pilar (dir. a)
  bp: z.number().positive(), // cm — dimensão do pilar (dir. b)
  h: z.number().positive(), // cm — altura total da sapata
  fck: z.number().min(20).max(90),
  aco: z.enum(["CA-25", "CA-50", "CA-60"]),
  dLinha: z.number().positive().default(5), // cm — cobrimento/CG (fundação ~5 cm)
  pesoProprioPct: z.number().min(0).max(30).default(5), // % — estimativa de peso próprio
  gamaF: z.number().positive().default(1.4),
});

export type EntradaSapata = z.infer<typeof entradaSchema>;
export type EntradaSapataInput = z.input<typeof entradaSchema>;

export type ResultadoSapata = {
  area: number; // m²
  a: number; // cm
  b: number; // cm
  sigmaSolo: number; // kPa (com peso próprio)
  sigmaOk: boolean;
  rigida: boolean;
  hMinRigida: number; // cm — h necessário p/ rígida
  metodo: "bielas" | "flexao";
  balancoA: number; // cm
  balancoB: number; // cm
  asACalcPorM: number; // cm²/m — calculado (bielas/flexão), dir. a
  asBCalcPorM: number; // cm²/m
  asAporM: number; // cm²/m — adotado (máx com As,mín)
  asBporM: number; // cm²/m
  asA: number; // cm² total adotado (dir. a, na largura b)
  asB: number; // cm² total adotado (dir. b, na largura a)
  asMin: number; // cm²/m
  puncao: ResultadoPuncao | null;
  situacao: "ok" | "revisar";
  alertas: string[];
};

/** As,mín de sapata (≈ laje, 0,15%·Ac). */
function asMinSapata(fck: number, h: number): number {
  const rho = fck <= 50 ? 0.15 : 0.15 + ((fck - 50) / 40) * 0.106;
  return (rho / 100) * (100 * h); // cm²/m
}

function arredondar5(xCm: number): number {
  return Math.ceil(xCm / 5) * 5;
}

export function calcular(input: EntradaSapataInput): ResultadoSapata {
  const v = entradaSchema.parse(input);
  const alertas: string[] = [];

  // 1. Área da base (abas iguais), em metros.
  const nkTotal = v.nk * (1 + v.pesoProprioPct / 100);
  const areaReq = nkTotal / v.sigmaAdm; // m²
  const apM = v.ap / 100;
  const bpM = v.bp / 100;
  // c² + (ap+bp)c + (ap·bp − A) = 0
  const cc = (-(apM + bpM) + Math.sqrt((apM + bpM) ** 2 - 4 * (apM * bpM - areaReq))) / 2;
  let a = arredondar5((apM + cc) * 100); // cm
  let b = arredondar5((bpM + cc) * 100);
  // Garante a ≥ ap e b ≥ bp.
  a = Math.max(a, v.ap + 10);
  b = Math.max(b, v.bp + 10);
  const area = (a / 100) * (b / 100); // m²
  const sigmaSolo = nkTotal / area; // kPa
  const sigmaOk = sigmaSolo <= v.sigmaAdm * 1.001;
  if (!sigmaOk) alertas.push(`σsolo (${sigmaSolo.toFixed(0)} kPa) > σadm (${v.sigmaAdm} kPa): aumentar a base.`);

  // 2. Rigidez (22.6.1).
  const d = v.h - v.dLinha;
  const hMinRigida = Math.max((a - v.ap) / 3, (b - v.bp) / 3);
  const rigida = v.h >= hMinRigida;
  const metodo: "bielas" | "flexao" = rigida ? "bielas" : "flexao";

  const fyd = ACOS[v.aco] / 10 / 1.15; // kN/cm²
  const nd = v.gamaF * v.nk; // carga de cálculo (sem peso próprio — não flete)
  const balancoA = (a - v.ap) / 2;
  const balancoB = (b - v.bp) / 2;
  const asMin = asMinSapata(v.fck, v.h);

  let asACalcPorM: number;
  let asBCalcPorM: number;
  let puncao: ResultadoPuncao | null = null;

  if (rigida) {
    // 3a. Bielas-tirantes: T = Nd·(a−ap)/(8d). As distribuída na largura transversal.
    const tA = (nd * (a - v.ap)) / (8 * d);
    const tB = (nd * (b - v.bp)) / (8 * d);
    asACalcPorM = tA / fyd / (b / 100);
    asBCalcPorM = tB / fyd / (a / 100);
  } else {
    // 3b. Flexão em balanço (face do pilar). σd estrutural (sem peso próprio).
    const sigmaD = nd / area; // kPa = kN/m²
    const lA = balancoA / 100; // m
    const lB = balancoB / 100;
    const mAporM = (sigmaD * lA * lA) / 2; // kN·m/m (faixa de 1 m, dir. a)
    const mBporM = (sigmaD * lB * lB) / 2;
    const armA = armaduraFaixa(mAporM, d, v.fck, fyd, 1); // σd já é de cálculo
    const armB = armaduraFaixa(mBporM, d, v.fck, fyd, 1);
    asACalcPorM = armA.as;
    asBCalcPorM = armB.as;
    if (armA.excede || armB.excede) alertas.push("x/d excede o limite na flexão — aumentar a altura da sapata.");

    // Punção (reusa E07): pilar interno sobre a sapata.
    puncao = calcularPuncao({
      posicao: "interno",
      c1: v.ap,
      c2: v.bp,
      d,
      fck: v.fck,
      fSd: nd,
      mSd: 0,
      rhoX: Math.max((armA.as / (100 * d)) * 100, 0.1),
      rhoY: Math.max((armB.as / (100 * d)) * 100, 0.1),
    });
    if (!puncao.okBiela) alertas.push("Punção: biela esmaga — aumentar a altura da sapata ou a seção do pilar.");
    if (puncao.precisaArmadura) alertas.push("Punção: τSd,C' > τRd1 — prever armadura de punção ou aumentar h.");
  }

  // Adota o maior entre o calculado e As,mín.
  const asAporM = Math.max(asACalcPorM, asMin);
  const asBporM = Math.max(asBCalcPorM, asMin);
  const asA = asAporM * (b / 100);
  const asB = asBporM * (a / 100);

  const situacao: "ok" | "revisar" =
    !sigmaOk || alertas.some((x) => x.includes("esmaga") || x.includes("excede")) ? "revisar" : "ok";

  return {
    area,
    a,
    b,
    sigmaSolo,
    sigmaOk,
    rigida,
    hMinRigida,
    metodo,
    balancoA,
    balancoB,
    asACalcPorM,
    asBCalcPorM,
    asAporM,
    asBporM,
    asA,
    asB,
    asMin,
    puncao,
    situacao,
    alertas,
  };
}
