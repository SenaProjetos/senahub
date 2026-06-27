/**
 * Builder DXF da sapata isolada (E21) — planta (base + pilar + armadura) e corte (altura h).
 * Engine em cm; DXF em mm (×10). Esquemático.
 */

import { DxfDocumento } from "@/lib/dxf";
import type { EntradaSapataInput } from "../calc/footing";
import { calcular } from "../calc/footing";

const CM_MM = 10;

export function desenharSapata(e: EntradaSapataInput): DxfDocumento {
  const r = calcular(e);
  const doc = new DxfDocumento();
  doc.camada("SAPATA", 7).camada("PILAR", 5).camada("ARMADURA", 1).camada("COTAS", 3).camada("TEXTO", 7);

  const a = r.a * CM_MM;
  const b = r.b * CM_MM;
  const ap = e.ap * CM_MM;
  const bp = e.bp * CM_MM;
  const h = e.h * CM_MM;

  // ── Planta (centro na origem) ──
  doc.polilinha(
    [
      { x: -a / 2, y: -b / 2 },
      { x: a / 2, y: -b / 2 },
      { x: a / 2, y: b / 2 },
      { x: -a / 2, y: b / 2 },
    ],
    { camada: "SAPATA", fechada: true },
  );
  doc.polilinha(
    [
      { x: -ap / 2, y: -bp / 2 },
      { x: ap / 2, y: -bp / 2 },
      { x: ap / 2, y: bp / 2 },
      { x: -ap / 2, y: bp / 2 },
    ],
    { camada: "PILAR", fechada: true },
  );
  // Armadura (malha esquemática): algumas barras em cada direção.
  const cob = (e.dLinha ?? 5) * CM_MM;
  const nx = 5;
  for (let i = 0; i <= nx; i++) {
    const x = -a / 2 + cob + ((a - 2 * cob) * i) / nx;
    doc.linha({ x, y: -b / 2 + cob }, { x, y: b / 2 - cob }, { camada: "ARMADURA" });
  }
  for (let i = 0; i <= nx; i++) {
    const y = -b / 2 + cob + ((b - 2 * cob) * i) / nx;
    doc.linha({ x: -a / 2 + cob, y }, { x: a / 2 - cob, y }, { camada: "ARMADURA" });
  }
  const off = Math.max(a, b) * 0.1 + 60;
  const alt = Math.max(a, b) * 0.03 + 12;
  doc.cotaLinear({ x: -a / 2, y: -b / 2 }, { x: a / 2, y: -b / 2 }, -off, { camada: "COTAS", altura: alt, texto: `a = ${r.a} cm` });
  doc.cotaLinear({ x: a / 2, y: -b / 2 }, { x: a / 2, y: b / 2 }, off, { camada: "COTAS", altura: alt, texto: `b = ${r.b} cm` });

  // ── Corte (abaixo da planta) ──
  const y0 = -b / 2 - off - h - alt * 8; // base do corte
  doc.polilinha(
    [
      { x: -a / 2, y: y0 },
      { x: a / 2, y: y0 },
      { x: a / 2, y: y0 + h },
      { x: -a / 2, y: y0 + h },
    ],
    { camada: "SAPATA", fechada: true },
  );
  // Arranque do pilar.
  doc.polilinha(
    [
      { x: -ap / 2, y: y0 + h },
      { x: ap / 2, y: y0 + h },
      { x: ap / 2, y: y0 + h + ap },
      { x: -ap / 2, y: y0 + h + ap },
    ],
    { camada: "PILAR", fechada: true },
  );
  // Armadura inferior (corte).
  doc.linha({ x: -a / 2 + cob, y: y0 + cob }, { x: a / 2 - cob, y: y0 + cob }, { camada: "ARMADURA" });
  doc.cotaLinear({ x: -a / 2, y: y0 }, { x: -a / 2, y: y0 + h }, -off, { camada: "COTAS", altura: alt, texto: `h = ${e.h} cm` });

  // Legenda.
  const legenda = [
    `Sapata ${r.metodo === "bielas" ? "rigida (bielas)" : "flexivel"} - ${r.a}x${r.b}x${e.h} cm`,
    `sigma_solo = ${r.sigmaSolo.toFixed(0)} kPa`,
    `As(a) = ${r.asAporM.toFixed(2)} cm2/m  As(b) = ${r.asBporM.toFixed(2)} cm2/m`,
  ];
  legenda.forEach((linha, i) => {
    doc.texto({ x: -a / 2, y: y0 - alt * 2 - i * alt * 1.6 }, alt, linha, { camada: "TEXTO" });
  });

  return doc;
}
