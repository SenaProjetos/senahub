/**
 * Builder DXF da seção (U02): contorno + eixos centroidais + marca do CG + cotas.
 * Engine trabalha em cm; DXF é em mm → escala ×10. Puro (sobre `lib/dxf`).
 */

import { DxfDocumento, type Ponto } from "@/lib/dxf";
import type { ResultadoSecao } from "../calc/section-properties";

const CM_MM = 10;
const s = (p: Ponto): Ponto => ({ x: p.x * CM_MM, y: p.y * CM_MM });

type Bbox = { xmin: number; xmax: number; ymin: number; ymax: number };

function bboxDe(r: ResultadoSecao): Bbox {
  if (r.geometria.tipo === "circulo") {
    const c = s(r.geometria.centro);
    const raio = r.geometria.raio * CM_MM;
    return { xmin: c.x - raio, xmax: c.x + raio, ymin: c.y - raio, ymax: c.y + raio };
  }
  const pts = r.geometria.pontos.map(s);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

export function desenharSecao(r: ResultadoSecao): DxfDocumento {
  const doc = new DxfDocumento();
  doc.camada("SECAO", 7).camada("EIXOS", 5).camada("CG", 1).camada("COTAS", 3);

  const bb = bboxDe(r);
  const larg = bb.xmax - bb.xmin;
  const alt = bb.ymax - bb.ymin;
  const maior = Math.max(larg, alt) || 1;
  const altura = Math.max(maior * 0.04, 5); // altura de texto/cota legível
  const ext = maior * 0.12 + altura; // extensão dos eixos além da seção
  const off = altura * 2.5; // afastamento das linhas de cota

  const cg = s(r.centroide);

  // Contorno.
  if (r.geometria.tipo === "circulo") {
    doc.circulo(s(r.geometria.centro), r.geometria.raio * CM_MM, { camada: "SECAO" });
  } else {
    doc.polilinha(r.geometria.pontos.map(s), { camada: "SECAO", fechada: true });
  }

  // Eixos centroidais (cruzam o CG, estendidos além da seção).
  doc.linha({ x: bb.xmin - ext, y: cg.y }, { x: bb.xmax + ext, y: cg.y }, { camada: "EIXOS" });
  doc.linha({ x: cg.x, y: bb.ymin - ext }, { x: cg.x, y: bb.ymax + ext }, { camada: "EIXOS" });

  // Marca do centroide.
  doc.circulo({ x: cg.x, y: cg.y }, altura * 0.5, { camada: "CG" });

  // Cotas (valores em cm — divide por 10 ao rotular).
  // Largura total (abaixo).
  doc.cotaLinear({ x: bb.xmin, y: bb.ymin }, { x: bb.xmax, y: bb.ymin }, -off, {
    camada: "COTAS",
    altura,
    texto: `${(larg / CM_MM).toFixed(1)} cm`,
  });
  // Altura total (à direita).
  doc.cotaLinear({ x: bb.xmax, y: bb.ymin }, { x: bb.xmax, y: bb.ymax }, -off, {
    camada: "COTAS",
    altura,
    texto: `${(alt / CM_MM).toFixed(1)} cm`,
  });
  // Altura do centroide a partir da base (à esquerda).
  doc.cotaLinear({ x: bb.xmin, y: bb.ymin }, { x: bb.xmin, y: cg.y }, off, {
    camada: "COTAS",
    altura,
    texto: `y_cg=${(r.fibras.yInf).toFixed(1)} cm`,
  });

  return doc;
}
