/**
 * Builder DXF do corte da viga com armadura (detalhamento preliminar — E01).
 * Engine em cm; DXF em mm (×10). Desenha contorno, estribo, barras de tração/compressão e cotas.
 * As bitolas são escolhidas de forma simples (preliminar) — o engenheiro ajusta o detalhamento final.
 */

import { DxfDocumento, type Ponto } from "@/lib/dxf";
import type { EntradaFlexao } from "../calc/concrete-beam-flexure";
import { calcular as calcularViga } from "../calc/concrete-beam-flexure";
import { selecionarBarras } from "../calc/bitolas";

const CM_MM = 10;
const COB = 2.5 * CM_MM; // cobrimento (mm)
const PHI_ESTRIBO = 5; // mm
const PHI_LONG = 16; // mm (bitola preliminar das barras longitudinais)

type RetMM = { largura: number; altura: number };

function dimsRetangulo(e: EntradaFlexao): RetMM {
  if (e.secao.forma === "retangular") return { largura: e.secao.b * CM_MM, altura: e.secao.h * CM_MM };
  return { largura: e.secao.bw * CM_MM, altura: e.secao.h * CM_MM }; // T: detalha a alma
}

function fileiraBarras(
  doc: DxfDocumento,
  n: number,
  raio: number,
  xIni: number,
  xFim: number,
  y: number,
): void {
  if (n <= 0) return;
  if (n === 1) {
    doc.circulo({ x: (xIni + xFim) / 2, y }, raio, { camada: "ARMADURA" });
    return;
  }
  const passo = (xFim - xIni) / (n - 1);
  for (let i = 0; i < n; i++) doc.circulo({ x: xIni + i * passo, y }, raio, { camada: "ARMADURA" });
}

export function desenharVigaSecao(e: EntradaFlexao): DxfDocumento {
  const r = calcularViga(e);
  const doc = new DxfDocumento();
  doc.camada("SECAO", 7).camada("ESTRIBO", 5).camada("ARMADURA", 1).camada("COTAS", 3).camada("TEXTO", 7);

  const { largura: B, altura: H } = dimsRetangulo(e);

  // Contorno (alma, no caso de T). Para T, desenha também as mesas como contorno completo.
  if (e.secao.forma === "T") {
    const bf = e.secao.bf * CM_MM;
    const hf = e.secao.hf * CM_MM;
    const bw = e.secao.bw * CM_MM;
    const Ht = e.secao.h * CM_MM;
    const xw0 = (bf - bw) / 2;
    const contorno: Ponto[] = [
      { x: 0, y: Ht },
      { x: bf, y: Ht },
      { x: bf, y: Ht - hf },
      { x: xw0 + bw, y: Ht - hf },
      { x: xw0 + bw, y: 0 },
      { x: xw0, y: 0 },
      { x: xw0, y: Ht - hf },
      { x: 0, y: Ht - hf },
    ];
    doc.polilinha(contorno, { camada: "SECAO", fechada: true });
  } else {
    doc.polilinha(
      [
        { x: 0, y: 0 },
        { x: B, y: 0 },
        { x: B, y: H },
        { x: 0, y: H },
      ],
      { camada: "SECAO", fechada: true },
    );
  }

  // Para o detalhamento da armadura, usa o retângulo da alma com origem em x0.
  const x0 = e.secao.forma === "T" ? (e.secao.bf * CM_MM - B) / 2 : 0;
  const yBaseEstribo = 0;

  // Estribo (laço retangular inset pelo cobrimento na alma).
  const ex0 = x0 + COB;
  const ex1 = x0 + B - COB;
  const ey0 = yBaseEstribo + COB;
  const ey1 = H - COB;
  doc.polilinha(
    [
      { x: ex0, y: ey0 },
      { x: ex1, y: ey0 },
      { x: ex1, y: ey1 },
      { x: ex0, y: ey1 },
    ],
    { camada: "ESTRIBO", fechada: true },
  );

  // Barras de tração (inferiores).
  const sel = selecionarBarras(r.As, PHI_LONG);
  const raioBarra = PHI_LONG / 2;
  const margem = COB + PHI_ESTRIBO + raioBarra;
  const yInf = yBaseEstribo + margem;
  fileiraBarras(doc, sel.n, raioBarra, x0 + margem, x0 + B - margem, yInf);

  // Barras de compressão (superiores), se armadura dupla.
  let selLinha: ReturnType<typeof selecionarBarras> | null = null;
  if (r.dupla && r.AsLinha > 0) {
    selLinha = selecionarBarras(r.AsLinha, PHI_LONG);
    fileiraBarras(doc, selLinha.n, raioBarra, x0 + margem, x0 + B - margem, H - margem);
  }

  // Cotas (largura e altura da alma) — rótulos em cm.
  const off = Math.max(H, B) * 0.12 + 8;
  const alt = Math.max(H, B) * 0.04 + 4;
  doc.cotaLinear({ x: x0, y: 0 }, { x: x0 + B, y: 0 }, -off, { camada: "COTAS", altura: alt, texto: `${(B / CM_MM).toFixed(0)} cm` });
  doc.cotaLinear({ x: x0 + B, y: 0 }, { x: x0 + B, y: H }, -off, { camada: "COTAS", altura: alt, texto: `${(H / CM_MM).toFixed(0)} cm` });

  // Legenda da armadura.
  const legenda = [
    `As = ${r.As.toFixed(2)} cm² -> ${sel.n} ø${PHI_LONG} mm (${sel.asEf.toFixed(2)} cm²)`,
    selLinha ? `As' = ${r.AsLinha.toFixed(2)} cm² -> ${selLinha.n} ø${PHI_LONG} mm` : "",
  ].filter(Boolean);
  legenda.forEach((linha, i) => {
    doc.texto({ x: x0, y: -off - alt * 3 - i * alt * 1.6 }, alt, linha, { camada: "TEXTO" });
  });

  return doc;
}
