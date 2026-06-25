/**
 * Builder DXF da escada (E08) — perfil longitudinal esquemático: laje inclinada (waist),
 * degraus em serrilha, patamar e linha de armadura principal. Engine em cm; DXF em mm (×10).
 */

import { DxfDocumento, type Ponto } from "@/lib/dxf";
import type { EntradaEscadaInput } from "../calc/stair";
import { calcular } from "../calc/stair";

const CM_MM = 10;

export function desenharEscadaPerfil(e: EntradaEscadaInput): DxfDocumento {
  const r = calcular(e);
  const doc = new DxfDocumento();
  doc.camada("LAJE", 7).camada("DEGRAU", 5).camada("ARMADURA", 1).camada("COTAS", 3).camada("TEXTO", 7);

  const g = (e.piso ?? 28) * CM_MM;
  const eh = (e.espelho ?? 18) * CM_MM;
  const hl = e.hLaje * CM_MM;
  const aLance = e.aLance * CM_MM;
  const aPat = (e.aPatamar ?? 0) * CM_MM;
  const nDeg = Math.max(1, Math.round(aLance / g));
  const subida = nDeg * eh; // altura total do lance

  // Linha de fundo da laje inclinada (waist), do pé até o topo do lance.
  const cosA = g / Math.hypot(g, eh);
  const sinA = eh / Math.hypot(g, eh);
  const espVert = hl / cosA; // espessura medida na vertical
  const peInf: Ponto = { x: 0, y: -espVert };
  const topoInf: Ponto = { x: aLance, y: subida - espVert };
  // Contorno: fundo inclinado + topo serrilhado + patamar.
  const fundo: Ponto[] = [peInf, { x: aLance, y: subida - espVert }];
  doc.linha(peInf, topoInf, { camada: "LAJE" });

  // Serrilha dos degraus (topo).
  let x = 0;
  let y = 0;
  const serra: Ponto[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < nDeg; i++) {
    serra.push({ x, y: y + eh }); // sobe espelho
    serra.push({ x: x + g, y: y + eh }); // avança piso
    x += g;
    y += eh;
  }
  doc.polilinha(serra, { camada: "DEGRAU" });
  // Fecha o lance (linha vertical no pé e no topo até o fundo).
  doc.linha({ x: 0, y: 0 }, peInf, { camada: "LAJE" });
  doc.linha({ x: aLance, y: subida }, { x: aLance, y: subida - espVert }, { camada: "LAJE" });

  // Patamar (horizontal no topo).
  if (aPat > 0) {
    doc.linha({ x: aLance, y: subida }, { x: aLance + aPat, y: subida }, { camada: "DEGRAU" });
    doc.linha({ x: aLance, y: subida - espVert }, { x: aLance + aPat, y: subida - espVert }, { camada: "LAJE" });
    doc.linha({ x: aLance + aPat, y: subida }, { x: aLance + aPat, y: subida - espVert }, { camada: "LAJE" });
  }
  void fundo;

  // Armadura principal (positiva) seguindo o fundo, recuada do cobrimento.
  const cob = (e.dLinha ?? 2.5) * CM_MM;
  const armA: Ponto = { x: cob * sinA, y: -espVert + cob };
  const armB: Ponto = { x: aLance + aPat - cob, y: (aPat > 0 ? subida : subida) - espVert + cob };
  doc.linha(armA, armB, { camada: "ARMADURA" });

  // Cota do vão horizontal + legenda.
  const off = subida * 0.18 + 40;
  const alt = subida * 0.05 + 12;
  doc.cotaLinear({ x: 0, y: -espVert }, { x: aLance + aPat, y: -espVert }, -off, { camada: "COTAS", altura: alt, texto: `L = ${((aLance + aPat) / CM_MM).toFixed(0)} cm` });
  const legenda = [
    `Esc. ${(e.piso ?? 28).toFixed(0)}x${(e.espelho ?? 18).toFixed(0)} - h ${e.hLaje} cm`,
    `As vao = ${r.asVao.toFixed(2)} cm2/m`,
    r.asApoio > 0 ? `As apoio = ${r.asApoio.toFixed(2)} cm2/m` : "",
  ].filter(Boolean);
  legenda.forEach((linha, i) => {
    doc.texto({ x: 0, y: -espVert - off - alt * 3 - i * alt * 1.6 }, alt, linha, { camada: "TEXTO" });
  });

  return doc;
}
