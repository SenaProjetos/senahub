/**
 * Engine U02 — Propriedades geométricas de seção.
 * Puro (sem I/O). Convenção: dimensões em **cm**; saídas em cm², cm⁴, cm³, cm.
 *
 * Polígono (ret./T/poligonal): área, centroide e momentos de inércia por integração de contorno
 * (shoelace + fórmulas de segundo momento), com transferência ao centroide (Steiner).
 * Círculo: fórmulas fechadas (exatas).
 */

import { z } from "zod";

export type Ponto = { x: number; y: number };

const pontoSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const entradaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("retangular"), b: z.number().positive(), h: z.number().positive() }),
  z.object({ tipo: z.literal("circular"), d: z.number().positive() }),
  z.object({
    tipo: z.literal("T"),
    bf: z.number().positive(),
    hf: z.number().positive(),
    bw: z.number().positive(),
    hw: z.number().positive(),
  }),
  z.object({ tipo: z.literal("poligonal"), pontos: z.array(pontoSchema).min(3) }),
]);

export type EntradaSecao = z.infer<typeof entradaSchema>;

/** Geometria do contorno p/ desenho (DXF). */
export type GeometriaSecao =
  | { tipo: "poligono"; pontos: Ponto[] }
  | { tipo: "circulo"; centro: Ponto; raio: number };

export type ResultadoSecao = {
  /** Área (cm²). */
  A: number;
  /** Centroide no sistema de coordenadas do contorno (cm). */
  centroide: Ponto;
  /** Momentos de inércia centroidais (cm⁴). */
  Ix: number;
  Iy: number;
  Ixy: number;
  /** Módulos resistentes à flexão em torno do eixo x (cm³). */
  Wx_sup: number;
  Wx_inf: number;
  /** Raios de giração (cm). */
  ix: number;
  iy: number;
  /** Distâncias do centroide às fibras extremas (cm). */
  fibras: { ySup: number; yInf: number };
  geometria: GeometriaSecao;
};

/** Propriedades centroidais de um polígono simples (qualquer orientação). */
export function propsPoligono(pontosEntrada: Ponto[]): {
  A: number;
  centroide: Ponto;
  Ix: number;
  Iy: number;
  Ixy: number;
  yMax: number;
  yMin: number;
  pontos: Ponto[];
} {
  if (pontosEntrada.length < 3) throw new Error("Polígono exige ao menos 3 pontos.");

  // Área assinada p/ detectar orientação.
  let aSign = 0;
  const n = pontosEntrada.length;
  for (let i = 0; i < n; i++) {
    const p = pontosEntrada[i];
    const q = pontosEntrada[(i + 1) % n];
    aSign += p.x * q.y - q.x * p.y;
  }
  aSign /= 2;
  if (Math.abs(aSign) < 1e-12) throw new Error("Polígono degenerado (área nula).");

  // Garante orientação anti-horária (área positiva).
  const pts = aSign < 0 ? [...pontosEntrada].reverse() : pontosEntrada;

  let A = 0;
  let cx = 0;
  let cy = 0;
  let ixO = 0; // ∫y² dA (sobre origem)
  let iyO = 0; // ∫x² dA
  let ixyO = 0; // ∫xy dA

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    A += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
    ixO += (p.y * p.y + p.y * q.y + q.y * q.y) * cross;
    iyO += (p.x * p.x + p.x * q.x + q.x * q.x) * cross;
    ixyO += (p.x * q.y + 2 * p.x * p.y + 2 * q.x * q.y + q.x * p.y) * cross;
  }

  A /= 2;
  cx /= 6 * A;
  cy /= 6 * A;
  ixO /= 12;
  iyO /= 12;
  ixyO /= 24;

  // Transferência ao centroide (Steiner).
  const Ix = ixO - A * cy * cy;
  const Iy = iyO - A * cx * cx;
  const Ixy = ixyO - A * cx * cy;

  const ys = pts.map((p) => p.y);
  return {
    A,
    centroide: { x: cx, y: cy },
    Ix,
    Iy,
    Ixy,
    yMax: Math.max(...ys),
    yMin: Math.min(...ys),
    pontos: pts,
  };
}

/** Gera o contorno (polígono) para os tipos paramétricos. */
function contornoDe(input: EntradaSecao): Ponto[] {
  switch (input.tipo) {
    case "retangular": {
      const { b, h } = input;
      return [
        { x: -b / 2, y: 0 },
        { x: b / 2, y: 0 },
        { x: b / 2, y: h },
        { x: -b / 2, y: h },
      ];
    }
    case "T": {
      const { bf, hf, bw, hw } = input;
      const H = hw + hf;
      return [
        { x: -bw / 2, y: 0 },
        { x: bw / 2, y: 0 },
        { x: bw / 2, y: hw },
        { x: bf / 2, y: hw },
        { x: bf / 2, y: H },
        { x: -bf / 2, y: H },
        { x: -bf / 2, y: hw },
        { x: -bw / 2, y: hw },
      ];
    }
    case "poligonal":
      return input.pontos;
    case "circular":
      throw new Error("Círculo não usa contorno poligonal.");
  }
}

export function calcular(input: EntradaSecao): ResultadoSecao {
  if (input.tipo === "circular") {
    const r = input.d / 2;
    const A = Math.PI * r * r;
    const I = (Math.PI * Math.pow(r, 4)) / 4;
    const W = (Math.PI * Math.pow(r, 3)) / 4;
    const i = r / 2;
    return {
      A,
      centroide: { x: 0, y: 0 },
      Ix: I,
      Iy: I,
      Ixy: 0,
      Wx_sup: W,
      Wx_inf: W,
      ix: i,
      iy: i,
      fibras: { ySup: r, yInf: r },
      geometria: { tipo: "circulo", centro: { x: 0, y: 0 }, raio: r },
    };
  }

  const contorno = contornoDe(input);
  const p = propsPoligono(contorno);

  const ySup = p.yMax - p.centroide.y;
  const yInf = p.centroide.y - p.yMin;

  return {
    A: p.A,
    centroide: p.centroide,
    Ix: p.Ix,
    Iy: p.Iy,
    Ixy: p.Ixy,
    Wx_sup: p.Ix / ySup,
    Wx_inf: p.Ix / yInf,
    ix: Math.sqrt(p.Ix / p.A),
    iy: Math.sqrt(p.Iy / p.A),
    fibras: { ySup, yInf },
    geometria: { tipo: "poligono", pontos: p.pontos },
  };
}
