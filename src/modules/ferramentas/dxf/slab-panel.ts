/**
 * Builder DXF do painel da laje (E05) — esquema de vinculação + armaduras por direção.
 * Engine em cm; DXF em mm (×10). Desenha o contorno, marca as bordas engastadas (hachura
 * dupla) e anota momentos/armaduras por direção. Esquemático — não é detalhamento executivo.
 */

import { DxfDocumento, type Ponto } from "@/lib/dxf";
import type { EntradaLajeInput, CasoLaje } from "../calc/slab-bares";
import { calcular } from "../calc/slab-bares";

const CM_MM = 10;

/** Bordas engastadas por caso, no referencial lx (horizontal, base) × ly (vertical, esquerda).
 * Bordas: T=topo, B=base, L=esquerda, R=direita. */
const ENGASTES: Record<CasoLaje, ("T" | "B" | "L" | "R")[]> = {
  "1": [],
  "2A": ["B"],
  "2B": ["R"],
  "3": ["B", "R"],
  "4A": ["T", "B"],
  "4B": ["L", "R"],
  "5A": ["T", "B", "R"],
  "5B": ["T", "B", "L"],
  "6": ["T", "B", "L", "R"],
};

export function desenharLajePainel(e: EntradaLajeInput): DxfDocumento {
  const r = calcular(e);
  const lx = Math.min(e.lx, e.ly) * CM_MM; // base (x)
  const ly = Math.max(e.lx, e.ly) * CM_MM; // altura (y)
  const doc = new DxfDocumento();
  doc.camada("LAJE", 7).camada("ENGASTE", 1).camada("COTAS", 3).camada("TEXTO", 7).camada("ARMADURA", 5);

  // Contorno do painel.
  doc.polilinha(
    [
      { x: 0, y: 0 },
      { x: lx, y: 0 },
      { x: lx, y: ly },
      { x: 0, y: ly },
    ],
    { camada: "LAJE", fechada: true },
  );

  // Bordas engastadas: linha paralela interna (offset) representando o engaste.
  const off = Math.min(lx, ly) * 0.05;
  const engaste = (a: Ponto, b: Ponto) => doc.linha(a, b, { camada: "ENGASTE" });
  for (const borda of ENGASTES[e.caso as CasoLaje]) {
    if (borda === "T") engaste({ x: 0, y: ly - off }, { x: lx, y: ly - off });
    if (borda === "B") engaste({ x: 0, y: off }, { x: lx, y: off });
    if (borda === "L") engaste({ x: off, y: 0 }, { x: off, y: ly });
    if (borda === "R") engaste({ x: lx - off, y: 0 }, { x: lx - off, y: ly });
  }

  // Setas/indicação das direções de armadura (x na base, y à esquerda).
  doc.texto({ x: lx / 2, y: off * 0.5 }, off * 0.6, "x (lx)", { camada: "ARMADURA" });
  doc.texto({ x: off * 0.5, y: ly / 2 }, off * 0.6, "y (ly)", { camada: "ARMADURA", rotacao: 90 });

  // Cotas.
  const offc = Math.max(lx, ly) * 0.1 + 8;
  const alt = Math.max(lx, ly) * 0.03 + 4;
  doc.cotaLinear({ x: 0, y: 0 }, { x: lx, y: 0 }, -offc, { camada: "COTAS", altura: alt, texto: `lx = ${(lx / CM_MM).toFixed(0)} cm` });
  doc.cotaLinear({ x: lx, y: 0 }, { x: lx, y: ly }, offc, { camada: "COTAS", altura: alt, texto: `ly = ${(ly / CM_MM).toFixed(0)} cm` });

  // Legenda: momentos e armaduras por direção.
  const linhas = [
    `Caso ${e.caso} — lambda = ${r.lambda.toFixed(2)} — h = ${e.h} cm`,
    ...r.momentos.map((m) => `${m.simbolo} = ${m.m.toFixed(2)} kNm/m  ->  As = ${m.as.toFixed(2)} cm2/m`),
    `Flecha total = ${r.flechaTotal.toFixed(2)} cm (lim L/250 = ${r.flechaLimite.toFixed(2)} cm)`,
  ];
  linhas.forEach((linha, i) => {
    doc.texto({ x: 0, y: -offc - alt * 3 - i * alt * 1.6 }, alt, linha, { camada: "TEXTO" });
  });

  return doc;
}
