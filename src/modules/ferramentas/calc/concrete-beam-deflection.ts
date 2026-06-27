/**
 * Flecha de viga (ELS) — NBR 6118:2023, inércia equivalente de Branson.
 * Puro. Unidades: kN, cm, kN/cm². Composto pela ferramenta E01.
 *
 * Hipótese de cálculo da flecha imediata: viga biapoiada com carga uniformemente distribuída
 * (coeficiente 5/48 sobre Ma·L²/(Ecs·Ieq)). Flecha diferida por fluência: δ∞ = δi·(1+αf).
 */

const ES = 21000; // kN/cm² (210 GPa)

type SecaoDefl =
  | { forma: "retangular"; b: number; h: number }
  | { forma: "T"; bf: number; hf: number; bw: number; h: number };

export type ParamsFlecha = {
  secao: SecaoDefl;
  d: number; // cm
  dLinha: number; // cm
  fck: number; // MPa
  As: number; // cm² (armadura efetiva de tração)
  AsLinha: number; // cm² (efetiva de compressão)
  vao: number; // cm (vão)
  mServ: number; // kN·m (momento de serviço — combinação quase permanente)
  alphaE?: number; // agregado (default 1.0 granito/gnaisse)
  deltaXi?: number; // coeficiente de fluência Δξ (default 2.0 → t∞ com t0≈0)
};

export type ResultadoFlecha = {
  ecs: number; // MPa (módulo secante)
  alphaEs: number; // αe = Es/Ecs
  ic: number; // cm⁴ (inércia bruta)
  mr: number; // kN·m (momento de fissuração)
  ma: number; // kN·m
  fissura: boolean;
  xII: number; // cm (LN no estádio II)
  iII: number; // cm⁴ (inércia fissurada)
  ieq: number; // cm⁴ (Branson)
  flechaImediata: number; // cm
  alphaF: number;
  flechaTotal: number; // cm
  limite: number; // cm (L/250)
  situacao: "ok" | "revisar";
  alertas: string[];
};

/** Módulo de elasticidade secante Ecs (MPa). */
export function moduloSecante(fck: number, alphaE = 1.0): number {
  const eci =
    fck <= 50
      ? alphaE * 5600 * Math.sqrt(fck)
      : 21500 * alphaE * Math.pow(fck / 10 + 1.25, 1 / 3);
  const alphaI = Math.min(0.8 + 0.2 * (fck / 80), 1.0);
  return alphaI * eci;
}

function larguraSup(secao: SecaoDefl): number {
  return secao.forma === "retangular" ? secao.b : secao.bf;
}

function inerciaBruta(secao: SecaoDefl): { ic: number; yt: number; alpha: number } {
  if (secao.forma === "retangular") {
    const { b, h } = secao;
    return { ic: (b * h ** 3) / 12, yt: h / 2, alpha: 1.5 };
  }
  // T: centroide e inércia da seção bruta.
  const { bf, hf, bw, h } = secao;
  const aMesa = bf * hf;
  const aAlma = bw * (h - hf);
  const a = aMesa + aAlma;
  const yMesa = h - hf / 2;
  const yAlma = (h - hf) / 2;
  const yc = (aMesa * yMesa + aAlma * yAlma) / a; // a partir da base
  const iMesa = (bf * hf ** 3) / 12 + aMesa * (yMesa - yc) ** 2;
  const iAlma = (bw * (h - hf) ** 3) / 12 + aAlma * (yAlma - yc) ** 2;
  return { ic: iMesa + iAlma, yt: yc, alpha: 1.2 };
}

/** Primeiro momento da área comprimida de concreto em relação à LN (profundidade x do topo). */
function qComp(secao: SecaoDefl, x: number): number {
  if (secao.forma === "retangular") return (secao.b * x * x) / 2;
  const { bf, hf, bw } = secao;
  if (x <= hf) return (bf * x * x) / 2;
  return bf * hf * (x - hf / 2) + (bw * (x - hf) ** 2) / 2;
}

/** Segundo momento da área comprimida de concreto em relação à LN. */
function iComp(secao: SecaoDefl, x: number): number {
  if (secao.forma === "retangular") return (secao.b * x ** 3) / 3;
  const { bf, hf, bw } = secao;
  if (x <= hf) return (bf * x ** 3) / 3;
  const flange = (bf * hf ** 3) / 12 + bf * hf * (x - hf / 2) ** 2;
  const alma = (bw * (x - hf) ** 3) / 3;
  return flange + alma;
}

/** LN no estádio II (seção fissurada, transformada) por bisseção. */
function neutraEstadioII(p: ParamsFlecha, alphaE: number): number {
  const f = (x: number) =>
    qComp(p.secao, x) + (alphaE - 1) * p.AsLinha * (x - p.dLinha) - alphaE * p.As * (p.d - x);
  let lo = 1e-6;
  let hi = p.d;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function calcularFlecha(p: ParamsFlecha): ResultadoFlecha {
  const alphaE_ag = p.alphaE ?? 1.0;
  const deltaXi = p.deltaXi ?? 2.0;
  const ecsMPa = moduloSecante(p.fck, alphaE_ag);
  const ecs = ecsMPa / 10; // kN/cm²
  const alphaEs = ES / ecs;

  const { ic, yt, alpha } = inerciaBruta(p.secao);
  const fctm = (p.fck <= 50 ? 0.3 * Math.pow(p.fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * p.fck)) / 10; // kN/cm²
  const mrKNcm = (alpha * fctm * ic) / yt;
  const maKNcm = p.mServ * 100;
  const fissura = maKNcm > mrKNcm;

  const xII = neutraEstadioII(p, alphaEs);
  const iII =
    iComp(p.secao, xII) + (alphaEs - 1) * p.AsLinha * (xII - p.dLinha) ** 2 + alphaEs * p.As * (p.d - xII) ** 2;

  const razao = Math.min(mrKNcm / maKNcm, 1);
  const ieq = fissura ? Math.min(razao ** 3 * ic + (1 - razao ** 3) * iII, ic) : ic;

  const flechaImediata = ((5 / 48) * maKNcm * p.vao ** 2) / (ecs * ieq);

  const rhoLinha = p.AsLinha / (larguraSup(p.secao) * p.d);
  const alphaF = deltaXi / (1 + 50 * rhoLinha);
  const flechaTotal = flechaImediata * (1 + alphaF);

  const limite = p.vao / 250;
  const situacao: "ok" | "revisar" = flechaTotal <= limite ? "ok" : "revisar";
  const alertas: string[] = [];
  if (situacao === "revisar") {
    alertas.push(
      `Flecha total (${flechaTotal.toFixed(2)} cm) excede o limite L/250 (${limite.toFixed(2)} cm): aumentar a altura ou a armadura.`,
    );
  }

  return {
    ecs: ecsMPa,
    alphaEs,
    ic,
    mr: mrKNcm / 100,
    ma: p.mServ,
    fissura,
    xII,
    iII,
    ieq,
    flechaImediata,
    alphaF,
    flechaTotal,
    limite,
    situacao,
    alertas,
  };
}
