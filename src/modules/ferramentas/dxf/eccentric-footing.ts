/**
 * Builder DXF das sapatas excêntricas (E22) — planta.
 * Isolada: base + pilar + indicação do diagrama de tensões. Viga de equilíbrio: as 2 sapatas + viga.
 * Engine em cm; DXF em mm (×10). Esquemático.
 */

import { DxfDocumento } from "@/lib/dxf";
import type { EntradaExcInput } from "../calc/eccentric-footing";
import { calcular } from "../calc/eccentric-footing";

const CM_MM = 10;

export function desenharSapataExc(e: EntradaExcInput): DxfDocumento {
  const doc = new DxfDocumento();
  doc.camada("SAPATA", 7).camada("PILAR", 5).camada("VIGA", 4).camada("DIVISA", 1).camada("COTAS", 3).camada("TEXTO", 7);

  if (e.modo === "isolada") {
    const r = calcular(e);
    if (r.modo !== "isolada") return doc;
    const a = e.a * CM_MM;
    const b = e.b * CM_MM;
    const ap = e.ap * CM_MM;
    doc.polilinha(
      [{ x: -a / 2, y: -b / 2 }, { x: a / 2, y: -b / 2 }, { x: a / 2, y: b / 2 }, { x: -a / 2, y: b / 2 }],
      { camada: "SAPATA", fechada: true },
    );
    doc.polilinha(
      [{ x: -ap / 2, y: -b / 2 - ap }, { x: ap / 2, y: -b / 2 - ap }, { x: ap / 2, y: -b / 2 }, { x: -ap / 2, y: -b / 2 }],
      { camada: "PILAR", fechada: true },
    );
    const alt = a * 0.04 + 12;
    const legenda = [
      `Sapata excentrica ${e.a}x${e.b} cm`,
      `e = ${r.e.toFixed(1)} cm (a/6 = ${r.emax.toFixed(1)}) ${r.descola ? "- DESCOLA" : ""}`,
      `sigma_max = ${r.sigmaMax.toFixed(0)} kPa  sigma_min = ${r.sigmaMin.toFixed(0)} kPa`,
      `As = ${r.asA.toFixed(2)} cm2/m`,
    ];
    legenda.forEach((linha, i) => doc.texto({ x: -a / 2, y: b / 2 + alt * 1.6 * (legenda.length - i) }, alt, linha, { camada: "TEXTO" }));
    return doc;
  }

  // Viga de equilíbrio.
  const r = calcular(e);
  if (r.modo !== "viga_equilibrio") return doc;
  const ell = e.ell * CM_MM;
  const a1 = e.a1 * CM_MM;
  const b1 = r.b1 * CM_MM;
  const ap1 = e.ap1 * CM_MM;
  const a2 = r.a2 * CM_MM;
  const b2 = r.b2 * CM_MM;
  const bw = (e.bwViga ?? 30) * CM_MM;

  // Divisa em x=0 (linha). Pilar de divisa no eixo x=0; sapata1 deslocada p/ +x (interior).
  doc.linha({ x: 0, y: -b1 }, { x: 0, y: b1 }, { camada: "DIVISA" });
  // Sapata 1 (divisa): face em x=0, comprimento a1 p/ dentro.
  doc.polilinha(
    [{ x: 0, y: -b1 / 2 }, { x: a1, y: -b1 / 2 }, { x: a1, y: b1 / 2 }, { x: 0, y: b1 / 2 }],
    { camada: "SAPATA", fechada: true },
  );
  // Pilar de divisa (no eixo x≈ap1/2).
  doc.polilinha(
    [{ x: 0, y: -ap1 / 2 }, { x: ap1, y: -ap1 / 2 }, { x: ap1, y: ap1 / 2 }, { x: 0, y: ap1 / 2 }],
    { camada: "PILAR", fechada: true },
  );
  // Sapata 2 (interna) centrada no pilar interno em x=ell.
  doc.polilinha(
    [{ x: ell - a2 / 2, y: -b2 / 2 }, { x: ell + a2 / 2, y: -b2 / 2 }, { x: ell + a2 / 2, y: b2 / 2 }, { x: ell - a2 / 2, y: b2 / 2 }],
    { camada: "SAPATA", fechada: true },
  );
  // Viga de equilíbrio (ligando os dois).
  doc.polilinha(
    [{ x: ap1, y: -bw / 2 }, { x: ell, y: -bw / 2 }, { x: ell, y: bw / 2 }, { x: ap1, y: bw / 2 }],
    { camada: "VIGA", fechada: true },
  );
  const alt = ell * 0.02 + 14;
  doc.cotaLinear({ x: 0, y: -Math.max(b1, b2) / 2 - 40 }, { x: ell, y: -Math.max(b1, b2) / 2 - 40 }, -40, { camada: "COTAS", altura: alt, texto: `l = ${e.ell} cm` });
  const legenda = [
    `Viga de equilibrio - R1=${r.r1.toFixed(0)} kN  R2=${r.r2.toFixed(0)} kN`,
    `Sapata divisa ${e.a1}x${r.b1}  |  interna ${r.a2}x${r.b2} cm`,
    `M_viga = ${r.mViga.toFixed(0)} kN.m  As_viga = ${r.asViga.toFixed(2)} cm2`,
  ];
  legenda.forEach((linha, i) => doc.texto({ x: 0, y: Math.max(b1, b2) / 2 + alt * 1.6 * (legenda.length - i) }, alt, linha, { camada: "TEXTO" }));
  return doc;
}
