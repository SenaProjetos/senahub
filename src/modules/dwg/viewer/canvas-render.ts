/**
 * Visualizador DWG — matemática PURA de transform/bbox pro canvas 2D. Sem I/O,
 * sem `ctx.*`/canvas real (não testável sob vitest, ambiente node sem DOM) — só
 * os números que o componente client (F3.2) usa pra desenhar. Convenção: mundo
 * em mm, Y para CIMA (mesma de `lib/dxf.ts`/`modules/dwg/parse.ts`); tela em
 * pixels, Y para BAIXO (canvas HTML) — o transform inverte o eixo Y.
 *
 * Simplificações conhecidas (aceitáveis pra bbox de enquadramento, não pra
 * geometria exata): bbox de ARCO usa o círculo completo (não o arco de fato);
 * bbox de TEXTO ignora rotação e usa largura aproximada (altura × 0.6 × nº de
 * caracteres), não a largura real da fonte.
 */
import type { Primitiva } from "../parse";

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

/** Transform afim mundo→tela: `tela = mundo * escala + offset`, com Y invertido. */
export type Transform = { escala: number; offsetX: number; offsetY: number };

function expandir(b: Bbox | null, x: number, y: number): Bbox {
  if (!b) return { minX: x, maxX: x, minY: y, maxY: y };
  return {
    minX: Math.min(b.minX, x),
    maxX: Math.max(b.maxX, x),
    minY: Math.min(b.minY, y),
    maxY: Math.max(b.maxY, y),
  };
}

/** Bounding box (mundo, mm) de toda a cena. `null` se não houver primitivas. */
export function bbox(primitivas: readonly Primitiva[]): Bbox | null {
  let b: Bbox | null = null;
  for (const p of primitivas) {
    switch (p.tipo) {
      case "linha":
        b = expandir(b, p.p1.x, p.p1.y);
        b = expandir(b, p.p2.x, p.p2.y);
        break;
      case "circulo":
        b = expandir(b, p.centro.x - p.raio, p.centro.y - p.raio);
        b = expandir(b, p.centro.x + p.raio, p.centro.y + p.raio);
        break;
      case "arco":
        // Aproximação: bbox do círculo completo (mais simples, superestima área).
        b = expandir(b, p.centro.x - p.raio, p.centro.y - p.raio);
        b = expandir(b, p.centro.x + p.raio, p.centro.y + p.raio);
        break;
      case "polilinha":
        for (const pt of p.pontos) b = expandir(b, pt.x, pt.y);
        break;
      case "texto": {
        const larguraAprox = p.altura * 0.6 * Math.max(p.conteudo.length, 1);
        b = expandir(b, p.p.x, p.p.y);
        b = expandir(b, p.p.x + larguraAprox, p.p.y + p.altura);
        break;
      }
    }
  }
  return b;
}

/**
 * Transform inicial que enquadra `caixa` dentro de um viewport `larguraPx` ×
 * `alturaPx`, com `margemPx` de respiro em cada lado. Preserva a proporção
 * (usa a menor escala entre X e Y) e centraliza a cena no viewport.
 */
export function ajustarParaVisualizar(caixa: Bbox, larguraPx: number, alturaPx: number, margemPx = 20): Transform {
  const larguraMundo = Math.max(caixa.maxX - caixa.minX, 1e-6);
  const alturaMundo = Math.max(caixa.maxY - caixa.minY, 1e-6);
  const larguraDisp = Math.max(larguraPx - 2 * margemPx, 1);
  const alturaDisp = Math.max(alturaPx - 2 * margemPx, 1);
  const escala = Math.min(larguraDisp / larguraMundo, alturaDisp / alturaMundo);

  const centroMundoX = (caixa.minX + caixa.maxX) / 2;
  const centroMundoY = (caixa.minY + caixa.maxY) / 2;
  const centroTelaX = larguraPx / 2;
  const centroTelaY = alturaPx / 2;

  // tela.x = mundo.x * escala + offsetX  ⇒  offsetX = centroTelaX - centroMundoX * escala
  // tela.y = -mundo.y * escala + offsetY (Y invertido) ⇒  offsetY = centroTelaY + centroMundoY * escala
  return {
    escala,
    offsetX: centroTelaX - centroMundoX * escala,
    offsetY: centroTelaY + centroMundoY * escala,
  };
}

/** Converte um ponto do mundo (mm, Y-cima) pra tela (px, Y-baixo). */
export function mundoParaTela(p: { x: number; y: number }, t: Transform): { x: number; y: number } {
  return { x: p.x * t.escala + t.offsetX, y: -p.y * t.escala + t.offsetY };
}

/** Converte um ponto de tela (px) de volta pro mundo (mm) — inverso de `mundoParaTela`. */
export function telaParaMundo(p: { x: number; y: number }, t: Transform): { x: number; y: number } {
  return { x: (p.x - t.offsetX) / t.escala, y: -(p.y - t.offsetY) / t.escala };
}

/**
 * Aplica zoom por `fator` (>1 aproxima, <1 afasta) mantendo `pivotTela` fixo na
 * tela — comportamento padrão de zoom por scroll-wheel sob o cursor.
 */
export function aplicarZoom(t: Transform, fator: number, pivotTela: { x: number; y: number }): Transform {
  const novaEscala = t.escala * fator;
  return {
    escala: novaEscala,
    offsetX: pivotTela.x - (pivotTela.x - t.offsetX) * fator,
    offsetY: pivotTela.y - (pivotTela.y - t.offsetY) * fator,
  };
}

/** Aplica pan por um delta em pixels de tela (arrasto do mouse). */
export function aplicarPan(t: Transform, deltaXPx: number, deltaYPx: number): Transform {
  return { ...t, offsetX: t.offsetX + deltaXPx, offsetY: t.offsetY + deltaYPx };
}
