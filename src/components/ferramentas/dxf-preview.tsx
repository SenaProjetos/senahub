"use client";

import { useMemo } from "react";
import type { Primitiva } from "@/lib/dxf";
import { documentoDxf } from "@/modules/ferramentas/dxf";

type Props = {
  ferramenta: string;
  entradas: Record<string, unknown> | null;
};

/** Cores ACI básicas → hex (para o preview). 7 = quase-preto. */
const ACI: Record<number, string> = {
  1: "#dc2626", 2: "#ca8a04", 3: "#16a34a", 4: "#0891b2",
  5: "#2563eb", 6: "#9333ea", 7: "#1f2937",
};
const cor = (camadas: ReadonlyMap<string, number>, nome: string) => ACI[camadas.get(nome) ?? 7] ?? "#1f2937";

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function ampliar(b: Box, x: number, y: number) {
  b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
}

function boundingBox(prims: readonly Primitiva[]): Box {
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of prims) {
    switch (p.tipo) {
      case "linha": ampliar(b, p.p1.x, p.p1.y); ampliar(b, p.p2.x, p.p2.y); break;
      case "polilinha": for (const pt of p.pontos) ampliar(b, pt.x, pt.y); break;
      case "circulo":
      case "arco": ampliar(b, p.centro.x - p.raio, p.centro.y - p.raio); ampliar(b, p.centro.x + p.raio, p.centro.y + p.raio); break;
      case "texto": ampliar(b, p.p.x, p.p.y); ampliar(b, p.p.x + p.conteudo.length * p.altura * 0.6, p.p.y + p.altura); break;
      case "cota": {
        const ux = p.p2.x - p.p1.x, uy = p.p2.y - p.p1.y;
        const len = Math.hypot(ux, uy) || 1;
        const nx = (-uy / len) * p.afastamento, ny = (ux / len) * p.afastamento;
        ampliar(b, p.p1.x + nx, p.p1.y + ny); ampliar(b, p.p2.x + nx, p.p2.y + ny);
        break;
      }
    }
  }
  return b;
}

export function DxfPreview({ ferramenta, entradas }: Props) {
  const dados = useMemo(() => {
    if (!entradas) return null;
    try {
      const doc = documentoDxf(ferramenta, entradas);
      if (!doc) return null;
      const prims = doc.cena();
      if (prims.length === 0) return null;
      return { prims, camadas: doc.getCamadas() };
    } catch {
      return null;
    }
  }, [ferramenta, entradas]);

  if (!dados) return null;

  const { prims, camadas } = dados;
  const box = boundingBox(prims);
  if (!Number.isFinite(box.minX)) return null;

  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.06 + 4;
  const w = box.maxX - box.minX + 2 * pad;
  const h = box.maxY - box.minY + 2 * pad;
  // Mapeia (x,y) DXF (Y p/ cima) → coords SVG (Y p/ baixo).
  const tx = (x: number) => x - box.minX + pad;
  const ty = (y: number) => box.maxY - y + pad;
  const traco = Math.max(w, h) * 0.004 + 0.4;

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900 p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-h-96" preserveAspectRatio="xMidYMid meet">
        {prims.map((p, i) => {
          const c = cor(camadas, p.camada);
          switch (p.tipo) {
            case "linha":
              return <line key={i} x1={tx(p.p1.x)} y1={ty(p.p1.y)} x2={tx(p.p2.x)} y2={ty(p.p2.y)} stroke={c} strokeWidth={traco} />;
            case "polilinha": {
              const pts = p.pontos.map((pt) => `${tx(pt.x)},${ty(pt.y)}`).join(" ");
              const El = p.fechada ? "polygon" : "polyline";
              return <El key={i} points={pts} fill="none" stroke={c} strokeWidth={traco} />;
            }
            case "circulo":
              return <circle key={i} cx={tx(p.centro.x)} cy={ty(p.centro.y)} r={p.raio} fill={c} stroke="none" />;
            case "arco": {
              const x0 = tx(p.centro.x + p.raio * Math.cos((p.a0 * Math.PI) / 180));
              const y0 = ty(p.centro.y + p.raio * Math.sin((p.a0 * Math.PI) / 180));
              const x1 = tx(p.centro.x + p.raio * Math.cos((p.a1 * Math.PI) / 180));
              const y1 = ty(p.centro.y + p.raio * Math.sin((p.a1 * Math.PI) / 180));
              const largo = ((p.a1 - p.a0 + 360) % 360) > 180 ? 1 : 0;
              return <path key={i} d={`M ${x0} ${y0} A ${p.raio} ${p.raio} 0 ${largo} 0 ${x1} ${y1}`} fill="none" stroke={c} strokeWidth={traco} />;
            }
            case "texto":
              return (
                <text key={i} x={tx(p.p.x)} y={ty(p.p.y)} fontSize={p.altura} fill={c}
                  transform={p.rotacao ? `rotate(${-p.rotacao} ${tx(p.p.x)} ${ty(p.p.y)})` : undefined}
                  dominantBaseline="middle" style={{ fontFamily: "monospace" }}>
                  {p.conteudo}
                </text>
              );
            case "cota": {
              const ux = p.p2.x - p.p1.x, uy = p.p2.y - p.p1.y;
              const len = Math.hypot(ux, uy) || 1;
              const nx = (-uy / len) * p.afastamento, ny = (ux / len) * p.afastamento;
              const a = { x: p.p1.x + nx, y: p.p1.y + ny };
              const bb = { x: p.p2.x + nx, y: p.p2.y + ny };
              const mid = { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 };
              return (
                <g key={i}>
                  <line x1={tx(p.p1.x)} y1={ty(p.p1.y)} x2={tx(a.x)} y2={ty(a.y)} stroke={c} strokeWidth={traco * 0.6} />
                  <line x1={tx(p.p2.x)} y1={ty(p.p2.y)} x2={tx(bb.x)} y2={ty(bb.y)} stroke={c} strokeWidth={traco * 0.6} />
                  <line x1={tx(a.x)} y1={ty(a.y)} x2={tx(bb.x)} y2={ty(bb.y)} stroke={c} strokeWidth={traco * 0.6} />
                  <text x={tx(mid.x)} y={ty(mid.y)} fontSize={p.altura} fill={c} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "monospace" }}>
                    {p.rotulo}
                  </text>
                </g>
              );
            }
          }
        })}
      </svg>
    </div>
  );
}
