/**
 * Hidráulica de tubulações sob pressão, compartilhada pelas calculadoras de bombas
 * (recalque de edifício e recirculação de piscina). Puro. SI: m, m³/s, m/s, mca.
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/bomba-recalque.md e bomba-piscina.md):
 * - Hazen-Williams com C editável (140 para PVC novo é valor usual de projeto);
 * - diâmetros internos do PVC soldável marrom (NBR 5648);
 * - margem de potência e potências comerciais de motor (prática de projeto, Macintyre).
 */

/** Gravidade (m/s²) e peso específico da água (N/m³) usados na potência. */
export const GRAVIDADE = 9.81;
export const GAMA_AGUA = 9810;
/** 1 cv = 735,5 W. */
export const W_POR_CV = 735.5;

export type DiametroComercial = {
  /** Diâmetro nominal (mm), como o PVC soldável é vendido. */
  dn: number;
  polegadas: string;
  /** Diâmetro interno (mm) — o que entra na perda de carga. */
  internoMm: number;
};

/** PVC soldável marrom (NBR 5648): DN e diâmetro interno usual. */
export const DIAMETROS_PVC: readonly DiametroComercial[] = [
  { dn: 20, polegadas: "1/2″", internoMm: 17.0 },
  { dn: 25, polegadas: "3/4″", internoMm: 21.6 },
  { dn: 32, polegadas: "1″", internoMm: 27.8 },
  { dn: 40, polegadas: "1 1/4″", internoMm: 35.2 },
  { dn: 50, polegadas: "1 1/2″", internoMm: 44.0 },
  { dn: 60, polegadas: "2″", internoMm: 53.4 },
  { dn: 75, polegadas: "2 1/2″", internoMm: 66.6 },
  { dn: 85, polegadas: "3″", internoMm: 75.6 },
  { dn: 110, polegadas: "4″", internoMm: 97.8 },
];

export const CHAVES_DN = DIAMETROS_PVC.map((d) => d.dn) as [number, ...number[]];

export function diametroPorDn(dn: number): DiametroComercial {
  const d = DIAMETROS_PVC.find((x) => x.dn === dn);
  if (!d) throw new Error(`DN ${dn} fora do catálogo de PVC soldável.`);
  return d;
}

/** Velocidade média (m/s) em tubo de diâmetro interno `internoMm`. */
export function velocidade(vazaoM3s: number, internoMm: number): number {
  const d = internoMm / 1000;
  return (4 * vazaoM3s) / (Math.PI * d * d);
}

/** Hazen-Williams: J = 10,643 · Q^1,85 · C^-1,85 · D^-4,87 (m/m). */
export function perdaUnitariaHW(vazaoM3s: number, internoMm: number, c: number): number {
  const d = internoMm / 1000;
  return (10.643 * Math.pow(vazaoM3s, 1.85)) / (Math.pow(c, 1.85) * Math.pow(d, 4.87));
}

/** Diâmetro econômico de recalque de Forchheimer (mm): D = 1,3 · (h/24)^¼ · √Q, Q em m³/s. */
export function diametroForchheimerMm(vazaoM3s: number, horasPorDia: number): number {
  return 1.3 * Math.pow(horasPorDia / 24, 0.25) * Math.sqrt(vazaoM3s) * 1000;
}

/** Menor diâmetro comercial cujo interno é ≥ `internoMinMm`; null se nenhum serve. */
export function menorDiametroInterno(internoMinMm: number): DiametroComercial | null {
  return DIAMETROS_PVC.find((d) => d.internoMm >= internoMinMm) ?? null;
}

/** Diâmetro comercial imediatamente acima de `dn`; null se `dn` já é o maior. */
export function diametroAcima(dn: number): DiametroComercial | null {
  const i = DIAMETROS_PVC.findIndex((d) => d.dn === dn);
  return i >= 0 ? (DIAMETROS_PVC[i + 1] ?? null) : null;
}

/** Menor diâmetro comercial cuja velocidade fica ≤ `vMax`; null se nem o maior serve. */
export function menorDiametroPorVelocidade(vazaoM3s: number, vMax: number): DiametroComercial | null {
  return DIAMETROS_PVC.find((d) => velocidade(vazaoM3s, d.internoMm) <= vMax) ?? null;
}

export type TrechoResultado = {
  dn: number;
  polegadas: string;
  internoMm: number;
  velocidadeMs: number;
  /** Perda unitária (m/m). */
  perdaUnitaria: number;
  comprimentoRealM: number;
  comprimentoEquivalenteM: number;
  comprimentoTotalM: number;
  /** Perda de carga total do trecho (mca). */
  perdaMca: number;
};

/** Perda de carga de um trecho: comprimento real + equivalente das conexões. */
export function calcularTrecho(args: {
  vazaoM3s: number;
  dn: number;
  comprimentoM: number;
  leqM: number;
  c: number;
}): TrechoResultado {
  const d = diametroPorDn(args.dn);
  const j = perdaUnitariaHW(args.vazaoM3s, d.internoMm, args.c);
  const total = args.comprimentoM + args.leqM;
  return {
    dn: d.dn,
    polegadas: d.polegadas,
    internoMm: d.internoMm,
    velocidadeMs: velocidade(args.vazaoM3s, d.internoMm),
    perdaUnitaria: j,
    comprimentoRealM: args.comprimentoM,
    comprimentoEquivalenteM: args.leqM,
    comprimentoTotalM: total,
    perdaMca: j * total,
  };
}

/** Potência absorvida pela bomba (cv): γ·Q·Hm / (η · 735,5), com γ = 9810 N/m³. */
export function potenciaCv(vazaoM3s: number, hmMca: number, rendimento: number): number {
  return (GAMA_AGUA * vazaoM3s * hmMca) / (rendimento * W_POR_CV);
}

/** Margem de segurança sobre a potência (Macintyre): quanto menor o motor, maior a folga. */
export const MARGENS_POTENCIA: readonly { ateCv: number; margem: number }[] = [
  { ateCv: 2, margem: 0.5 },
  { ateCv: 5, margem: 0.3 },
  { ateCv: 10, margem: 0.2 },
  { ateCv: 20, margem: 0.15 },
  { ateCv: Infinity, margem: 0.1 },
];

export function margemDePotencia(cv: number): number {
  return (MARGENS_POTENCIA.find((m) => cv <= m.ateCv) ?? MARGENS_POTENCIA[MARGENS_POTENCIA.length - 1]).margem;
}

/** Potências comerciais usuais de motor (cv). */
export const MOTORES_CV: readonly number[] = [
  0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200,
];

/** Menor motor comercial ≥ `cv`; null se passa do maior da tabela. */
export function motorComercial(cv: number): number | null {
  return MOTORES_CV.find((m) => m >= cv) ?? null;
}

export type DimensionamentoMotor = {
  potenciaCv: number;
  margem: number;
  comMargemCv: number;
  motorCv: number | null;
};

export function dimensionarMotor(vazaoM3s: number, hmMca: number, rendimento: number): DimensionamentoMotor {
  const p = potenciaCv(vazaoM3s, hmMca, rendimento);
  const margem = margemDePotencia(p);
  const comMargem = p * (1 + margem);
  // Altura manométrica zero ou negativa não dimensiona motor: o chamador avisa.
  return { potenciaCv: p, margem, comMargemCv: comMargem, motorCv: p > 0 ? motorComercial(comMargem) : null };
}
