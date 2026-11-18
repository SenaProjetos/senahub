"use client";

// Carrega o DXF convertido de um DWG e o desenha como vetor no palco (a cada quadro, na cor da camada).
import type { CenaDwg, Primitiva } from "@/modules/dwg/parse";
import { bbox } from "@/modules/dwg/viewer/canvas-render";
import { primitivasDaCamada } from "@/modules/coordenacao/sobreposicao/regras";
import type { Caixa } from "@/modules/coordenacao/sobreposicao/transformacao";

export type RenderDwg = {
  formato: "dwg";
  /** Em coordenadas do DXF (Y para cima); o nativo da camada é `nativoDwg` = (x, −y). */
  primitivas: Primitiva[];
  /** Fora da base, as primitivas do SENA_ARQ (só desenhadas, em cinza, enquanto a camada é alinhada). */
  arquitetura: Primitiva[];
  /** Caixa do desenho inteiro (com a arquitetura de fundo) no espaço nativo (Y para baixo). */
  caixaNativa: Caixa;
  /** Fora da base, o DWG não tinha o layer SENA_ARQ. */
  avisoArquitetura: boolean;
};

/** Matriz de canvas `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matriz = [number, number, number, number, number, number];

const MAX_EM_CACHE = 6;
const cenas = new Map<string, Promise<CenaDwg>>();

async function baixar(desenhoId: string): Promise<CenaDwg> {
  const [DxfParserMod, parseMod, res] = await Promise.all([
    import("dxf-parser"),
    import("@/modules/dwg/parse"),
    fetch(`/api/dwg/${encodeURIComponent(desenhoId)}/dxf`),
  ]);
  if (!res.ok) throw new Error(`Falha ao buscar o DXF (${res.status}).`);
  const texto = await res.text();
  const parsed = new DxfParserMod.default().parseSync(texto);
  if (!parsed) throw new Error("DXF vazio ou inválido.");
  return parseMod.converterParaCena(parsed);
}

export async function renderDwg(opts: { desenhoId: string; base: boolean }): Promise<RenderDwg> {
  let p = cenas.get(opts.desenhoId);
  if (!p) {
    p = baixar(opts.desenhoId);
    p.catch(() => cenas.delete(opts.desenhoId));
  }
  cenas.delete(opts.desenhoId);
  cenas.set(opts.desenhoId, p);
  while (cenas.size > MAX_EM_CACHE) cenas.delete(cenas.keys().next().value as string);

  const cena = await p;
  const caixa = bbox(cena.primitivas);
  if (!caixa) throw new Error("O desenho não tem nada para mostrar.");
  const { primitivas, arquitetura, achouArquitetura } = primitivasDaCamada(cena.primitivas, opts.base);
  return {
    formato: "dwg",
    primitivas,
    arquitetura,
    // DXF é Y para cima: o nativo inverte o Y, então a caixa troca min e max.
    caixaNativa: { minX: caixa.minX, minY: -caixa.maxY, maxX: caixa.maxX, maxY: -caixa.minY },
    avisoArquitetura: !opts.base && !achouArquitetura,
  };
}

const PARA_RAD = Math.PI / 180;
/** Texto menor que isto na tela não é desenhado (vira ruído). */
const TEXTO_MINIMO_PX = 3;

/**
 * Desenha as primitivas da camada com `nativoParaTela` (nativo da camada → px do canvas). Com
 * `corArquitetura`, desenha antes, nessa cor, a arquitetura de fundo que a camada esconde (ao alinhar).
 */
export function desenharDwg(
  ctx: CanvasRenderingContext2D,
  r: RenderDwg,
  nativoParaTela: Matriz,
  cor: string,
  espessura: number,
  corArquitetura?: string,
): void {
  if (corArquitetura && r.arquitetura.length > 0) {
    desenharPrimitivas(ctx, r.arquitetura, nativoParaTela, corArquitetura, espessura);
  }
  desenharPrimitivas(ctx, r.primitivas, nativoParaTela, cor, espessura);
}

/**
 * O caminho é montado sob a matriz e o traço sai com a matriz zerada, para a espessura ficar em 1 px
 * em qualquer zoom.
 */
function desenharPrimitivas(
  ctx: CanvasRenderingContext2D,
  primitivas: readonly Primitiva[],
  nativoParaTela: Matriz,
  cor: string,
  espessura: number,
): void {
  const [a, b, c, d, e, f] = nativoParaTela;
  ctx.save();
  // DXF → nativo é (x, −y): a matriz final para o DXF inverte a segunda coluna.
  ctx.setTransform(a, b, -c, -d, e, f);
  ctx.beginPath();
  for (const p of primitivas) {
    switch (p.tipo) {
      case "linha":
        ctx.moveTo(p.p1.x, p.p1.y);
        ctx.lineTo(p.p2.x, p.p2.y);
        break;
      case "circulo":
        ctx.moveTo(p.centro.x + p.raio, p.centro.y);
        ctx.arc(p.centro.x, p.centro.y, p.raio, 0, Math.PI * 2);
        break;
      case "arco": {
        // Ângulos do DXF são anti-horários com Y para cima — o mesmo sentido do canvas sob esta matriz.
        const a0 = p.a0 * PARA_RAD;
        ctx.moveTo(p.centro.x + p.raio * Math.cos(a0), p.centro.y + p.raio * Math.sin(a0));
        ctx.arc(p.centro.x, p.centro.y, p.raio, a0, p.a1 * PARA_RAD);
        break;
      }
      case "polilinha":
        if (p.pontos.length < 2) break;
        ctx.moveTo(p.pontos[0].x, p.pontos[0].y);
        for (let i = 1; i < p.pontos.length; i++) ctx.lineTo(p.pontos[i].x, p.pontos[i].y);
        if (p.fechada) ctx.lineTo(p.pontos[0].x, p.pontos[0].y);
        break;
      case "texto":
        break;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  ctx.stroke();

  // Texto: posição pela matriz, sem espelhar (rotação ignorada, como no visualizador DWG).
  const escala = Math.hypot(a, b);
  ctx.fillStyle = cor;
  ctx.textBaseline = "alphabetic";
  for (const p of primitivas) {
    if (p.tipo !== "texto" || !p.conteudo) continue;
    const px = p.altura * escala;
    if (px < TEXTO_MINIMO_PX) continue;
    const x = p.p.x;
    const y = -p.p.y;
    ctx.font = `${px}px sans-serif`;
    ctx.fillText(p.conteudo, a * x + c * y + e, b * x + d * y + f);
  }
  ctx.restore();
}
