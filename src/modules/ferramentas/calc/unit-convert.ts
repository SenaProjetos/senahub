/**
 * Engine U01 — Conversor de unidades de engenharia.
 * Puro (sem I/O, sem Prisma). Converte via fator para unidade-base SI.
 */

import { z } from "zod";

export type Dimensao =
  | "comprimento"
  | "area"
  | "volume"
  | "massa"
  | "forca"
  | "tensao"
  | "momento"
  | "vazao"
  | "angulo";

type UnidadeInfo = {
  label: string;
  /** Fator de conversão: valor_na_unidade × fator = valor_na_unidade_base_SI. */
  fator: number;
};

/** Unidades por dimensão com o fator para a unidade-base SI. */
export const UNIDADES: Record<Dimensao, Record<string, UnidadeInfo>> = {
  comprimento: {
    // base: m
    mm: { label: "mm", fator: 1e-3 },
    cm: { label: "cm", fator: 1e-2 },
    m: { label: "m", fator: 1 },
    km: { label: "km", fator: 1e3 },
    in: { label: "in (polegada)", fator: 0.0254 },
    ft: { label: "ft (pé)", fator: 0.3048 },
  },
  area: {
    // base: m²
    mm2: { label: "mm²", fator: 1e-6 },
    cm2: { label: "cm²", fator: 1e-4 },
    m2: { label: "m²", fator: 1 },
    km2: { label: "km²", fator: 1e6 },
    ha: { label: "ha (hectare)", fator: 1e4 },
    in2: { label: "in²", fator: 6.4516e-4 },
    ft2: { label: "ft²", fator: 0.09290304 },
  },
  volume: {
    // base: m³
    cm3: { label: "cm³", fator: 1e-6 },
    dm3: { label: "dm³ (litro)", fator: 1e-3 },
    m3: { label: "m³", fator: 1 },
    L: { label: "L (litro)", fator: 1e-3 },
    mL: { label: "mL", fator: 1e-6 },
    in3: { label: "in³", fator: 1.6387064e-5 },
    ft3: { label: "ft³", fator: 0.028316847 },
    gal: { label: "gal (US)", fator: 3.785411784e-3 },
  },
  massa: {
    // base: kg
    g: { label: "g", fator: 1e-3 },
    kg: { label: "kg", fator: 1 },
    t: { label: "t (tonelada métrica)", fator: 1e3 },
    lb: { label: "lb (libra)", fator: 0.45359237 },
    oz: { label: "oz (onça)", fator: 0.028349523 },
  },
  forca: {
    // base: N
    N: { label: "N", fator: 1 },
    kN: { label: "kN", fator: 1e3 },
    MN: { label: "MN", fator: 1e6 },
    kgf: { label: "kgf", fator: 9.80665 },
    tf: { label: "tf (tonelada-força)", fator: 9806.65 },
    lbf: { label: "lbf", fator: 4.4482216 },
    kip: { label: "kip", fator: 4448.2216 },
  },
  tensao: {
    // base: Pa
    Pa: { label: "Pa", fator: 1 },
    kPa: { label: "kPa", fator: 1e3 },
    MPa: { label: "MPa", fator: 1e6 },
    GPa: { label: "GPa", fator: 1e9 },
    kgf_cm2: { label: "kgf/cm²", fator: 98066.5 },
    kgf_m2: { label: "kgf/m²", fator: 9.80665 },
    tf_m2: { label: "tf/m²", fator: 9806.65 },
    kN_m2: { label: "kN/m²", fator: 1e3 },
    psi: { label: "psi", fator: 6894.757 },
    ksi: { label: "ksi", fator: 6894757 },
  },
  momento: {
    // base: N·m
    Nm: { label: "N·m", fator: 1 },
    kNm: { label: "kN·m", fator: 1e3 },
    MNm: { label: "MN·m", fator: 1e6 },
    kgfm: { label: "kgf·m", fator: 9.80665 },
    tfm: { label: "tf·m", fator: 9806.65 },
    kgfcm: { label: "kgf·cm", fator: 0.0980665 },
    lbfft: { label: "lbf·ft", fator: 1.3558179 },
    kipin: { label: "kip·in", fator: 112.98485 },
  },
  vazao: {
    // base: m³/s
    m3_s: { label: "m³/s", fator: 1 },
    m3_h: { label: "m³/h", fator: 1 / 3600 },
    L_s: { label: "L/s", fator: 1e-3 },
    L_min: { label: "L/min", fator: 1e-3 / 60 },
    L_h: { label: "L/h", fator: 1e-3 / 3600 },
    gpm: { label: "gpm (US)", fator: 6.30902e-5 },
  },
  angulo: {
    // base: rad
    rad: { label: "rad", fator: 1 },
    deg: { label: "° (grau)", fator: Math.PI / 180 },
    grad: { label: "grad", fator: Math.PI / 200 },
    mrad: { label: "mrad", fator: 1e-3 },
  },
};

export const DIMENSOES: Dimensao[] = Object.keys(UNIDADES) as Dimensao[];

export const entradaSchema = z.object({
  dimensao: z.enum(DIMENSOES as [Dimensao, ...Dimensao[]]),
  valor: z.number().finite(),
  de: z.string().min(1),
  para: z.string().min(1),
});

export type EntradaUnitConvert = z.infer<typeof entradaSchema>;

export type ResultadoUnitConvert = {
  valor: number;
  de: string;
  para: string;
  /** Fator direto de: para (de × fator = para). */
  fator: number;
};

export function converter(input: EntradaUnitConvert): ResultadoUnitConvert {
  const unidades = UNIDADES[input.dimensao];
  const unidadeDe = unidades[input.de];
  const unidadePara = unidades[input.para];

  if (!unidadeDe) throw new Error(`Unidade desconhecida: "${input.de}" para dimensão "${input.dimensao}"`);
  if (!unidadePara) throw new Error(`Unidade desconhecida: "${input.para}" para dimensão "${input.dimensao}"`);

  // valor_SI = valor * fator_de  →  resultado = valor_SI / fator_para
  const fator = unidadeDe.fator / unidadePara.fator;
  const valor = input.valor * fator;

  return { valor, de: input.de, para: input.para, fator };
}
