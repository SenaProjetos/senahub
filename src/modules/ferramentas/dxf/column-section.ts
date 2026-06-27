/**
 * Builder DXF da seção do pilar com armadura (detalhamento preliminar — E04).
 * Engine em cm; DXF em mm (×10). Contorno, estribo, barras longitudinais distribuídas no
 * perímetro, cotas e legenda. Arranjo preliminar — o engenheiro ajusta o detalhamento final.
 */

import { DxfDocumento, type Ponto } from "@/lib/dxf";
import type { EntradaPilarInput } from "../calc/concrete-column";
import { calcular as calcularPilar } from "../calc/concrete-column";

const CM_MM = 10;
const COB = 2.5 * CM_MM; // cobrimento (mm)
const PHI_ESTRIBO = 5; // mm

/** Distribui n barras (par, ≥4) no perímetro de um retângulo, priorizando a face mais longa. */
function pontosPerimetro(n: number, x0: number, y0: number, x1: number, y1: number): Ponto[] {
  const total = Math.max(4, n % 2 === 0 ? n : n + 1);
  let nh = 2; // barras por face horizontal (incl. cantos)
  let nvInner = 0; // barras internas por face vertical (excl. cantos)
  while (2 * nh + 2 * nvInner < total) {
    if (x1 - x0 >= y1 - y0) nh++;
    else nvInner++;
  }
  const pts: Ponto[] = [];
  const passoH = nh > 1 ? (x1 - x0) / (nh - 1) : 0;
  for (let i = 0; i < nh; i++) {
    const x = nh > 1 ? x0 + i * passoH : (x0 + x1) / 2;
    pts.push({ x, y: y1 }); // topo
    pts.push({ x, y: y0 }); // base
  }
  const passoV = (y1 - y0) / (nvInner + 1);
  for (let j = 1; j <= nvInner; j++) {
    const y = y0 + j * passoV;
    pts.push({ x: x0, y });
    pts.push({ x: x1, y });
  }
  return pts;
}

export function desenharPilarSecao(e: EntradaPilarInput): DxfDocumento {
  const r = calcularPilar(e);
  const v = { b: e.b, h: e.h, phi: e.phi ?? 20 };
  const B = v.b * CM_MM;
  const H = v.h * CM_MM;
  const doc = new DxfDocumento();
  doc.camada("SECAO", 7).camada("ESTRIBO", 5).camada("ARMADURA", 1).camada("COTAS", 3).camada("TEXTO", 7);

  // Contorno.
  doc.polilinha(
    [
      { x: 0, y: 0 },
      { x: B, y: 0 },
      { x: B, y: H },
      { x: 0, y: H },
    ],
    { camada: "SECAO", fechada: true },
  );

  // Estribo (inset pelo cobrimento).
  doc.polilinha(
    [
      { x: COB, y: COB },
      { x: B - COB, y: COB },
      { x: B - COB, y: H - COB },
      { x: COB, y: H - COB },
    ],
    { camada: "ESTRIBO", fechada: true },
  );

  // Barras longitudinais (no eixo das barras, inset por cobrimento + estribo + raio). φ já em mm.
  const raioBarra = v.phi / 2; // mm
  const margem = COB + PHI_ESTRIBO + raioBarra; // mm
  const pts = pontosPerimetro(r.nBarras, margem, margem, B - margem, H - margem);
  for (const p of pts) doc.circulo(p, raioBarra, { camada: "ARMADURA" });

  // Cotas (cm).
  const off = Math.max(H, B) * 0.12 + 8;
  const alt = Math.max(H, B) * 0.04 + 4;
  doc.cotaLinear({ x: 0, y: 0 }, { x: B, y: 0 }, -off, { camada: "COTAS", altura: alt, texto: `${v.b.toFixed(0)} cm` });
  doc.cotaLinear({ x: B, y: 0 }, { x: B, y: H }, -off, { camada: "COTAS", altura: alt, texto: `${v.h.toFixed(0)} cm` });

  // Legenda.
  const legenda = [
    `As = ${r.As.toFixed(2)} cm2 (${r.taxaGeom.toFixed(2)}% Ac)`,
    `Arranjo: ${r.nBarras} barras ø${v.phi} mm`,
    `Nd = ${e.Nd} kN`,
  ];
  legenda.forEach((linha, i) => {
    doc.texto({ x: 0, y: -off - alt * 3 - i * alt * 1.6 }, alt, linha, { camada: "TEXTO" });
  });

  return doc;
}
