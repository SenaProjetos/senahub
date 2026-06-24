/**
 * Cisalhamento de viga — NBR 6118:2023, Modelo de Cálculo I (bielas a 45°, estribos verticais).
 * Puro. Unidades: kN, cm, kN/cm². Composto pela ferramenta E01 (não é tool standalone).
 */

/** Resistência média à tração do concreto fctm (MPa) — NBR 6118 8.2.5. */
export function fctmMPa(fck: number): number {
  return fck <= 50 ? 0.3 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * fck);
}

export type ParamsCisalhamento = {
  bw: number; // cm
  d: number; // cm
  fck: number; // MPa
  Vk: number; // kN (esforço cortante característico)
  fywk?: number; // MPa (aço do estribo; default 500 = CA-50)
  gamaF?: number; // default 1.4
};

export type ResultadoCisalhamento = {
  vsd: number; // kN
  vRd2: number; // kN (biela comprimida)
  vc: number; // kN (parcela do concreto)
  vsw: number; // kN (parcela dos estribos)
  aswS: number; // cm²/m (armadura transversal por metro)
  aswSmin: number; // cm²/m (mínima)
  aswSadotar: number; // cm²/m (máx entre calculada e mínima)
  sMax: number; // cm (espaçamento longitudinal máximo)
  situacao: "ok" | "revisar";
  alertas: string[];
};

export function calcularCisalhamento(p: ParamsCisalhamento): ResultadoCisalhamento {
  const gamaF = p.gamaF ?? 1.4;
  const fywk = p.fywk ?? 500;
  const { bw, d, fck } = p;

  const Vsd = gamaF * p.Vk;
  const fcd = fck / 10 / 1.4; // kN/cm²
  const alphaV2 = 1 - fck / 250;
  const vRd2 = 0.27 * alphaV2 * fcd * bw * d; // kN

  const fctm = fctmMPa(fck);
  const fctkInf = 0.7 * fctm;
  const fctd = fctkInf / 1.4 / 10; // kN/cm²
  const vc = 0.6 * fctd * bw * d; // kN

  // fywd limitado a 435 MPa para estribos (NBR 6118 17.4.2.2).
  const fywd = Math.min(fywk / 1.15, 435) / 10; // kN/cm²

  const vsw = Math.max(Vsd - vc, 0);
  const aswS_cm = vsw / (0.9 * d * fywd); // cm²/cm
  const aswS = aswS_cm * 100; // cm²/m

  // Armadura transversal mínima: ρsw,mín = 0,2·fctm/fywk.
  const rhoSwMin = (0.2 * fctm) / fywk;
  const aswSmin = rhoSwMin * bw * 100; // cm²/m

  const aswSadotar = Math.max(aswS, aswSmin);

  // Espaçamento máximo longitudinal.
  const sMax = Vsd <= 0.67 * vRd2 ? Math.min(0.6 * d, 30) : Math.min(0.3 * d, 20);

  const alertas: string[] = [];
  let situacao: "ok" | "revisar" = "ok";
  if (Vsd > vRd2) {
    situacao = "revisar";
    alertas.push(`VSd (${Vsd.toFixed(1)} kN) > VRd2 (${vRd2.toFixed(1)} kN): biela comprimida rompe — aumentar bw ou fck.`);
  }
  if (aswS <= aswSmin) {
    alertas.push("Cortante baixo: adotar a armadura transversal mínima.");
  }

  return {
    vsd: Vsd,
    vRd2,
    vc,
    vsw,
    aswS,
    aswSmin,
    aswSadotar,
    sMax,
    situacao,
    alertas,
  };
}
