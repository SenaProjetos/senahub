"use client";

// Pinos dos apontamentos abertos e o ponto que está sendo apontado, por cima do palco (px CSS).
import type { PinoNoMundo } from "@/modules/coordenacao/sobreposicao/apontar";
import { COR_ALERTA } from "@/modules/coordenacao/sobreposicao/regras";
import { aplicar, type Ponto } from "@/modules/coordenacao/sobreposicao/transformacao";
import type { VistaPalco } from "./palco";

/** Raio do pino em px de tela; o clique acerta o pino até este raio + folga. */
export const RAIO_PINO = 10;
export const RAIO_CLIQUE_PINO = 14;
/** Papel do pino de rascunho e número do pino enviado. */
const BRANCO = "#ffffff";

export function desenharPinos(ctx: CanvasRenderingContext2D, vista: VistaPalco, pinos: readonly PinoNoMundo[]) {
  ctx.save();
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 2;
  for (const p of pinos) {
    const t = aplicar(vista, p.mundo);
    ctx.beginPath();
    ctx.arc(t.x, t.y, RAIO_PINO, 0, Math.PI * 2);
    // Rascunho: anel tracejado e número na cor; enviado: disco cheio e número branco.
    ctx.setLineDash(p.rascunho ? [3, 2] : []);
    ctx.fillStyle = p.rascunho ? BRANCO : p.cor;
    ctx.strokeStyle = p.cor;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.rascunho ? p.cor : BRANCO;
    ctx.fillText(String(p.numero), t.x, t.y + 0.5);
  }
  ctx.restore();
}

/** Mira no ponto escolhido enquanto o diálogo do apontamento está aberto (entra na imagem de contexto). */
export function desenharMira(ctx: CanvasRenderingContext2D, vista: VistaPalco, mundo: Ponto) {
  const t = aplicar(vista, mundo);
  ctx.save();
  ctx.strokeStyle = COR_ALERTA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 16, 0, Math.PI * 2);
  ctx.moveTo(t.x - 24, t.y);
  ctx.lineTo(t.x - 8, t.y);
  ctx.moveTo(t.x + 8, t.y);
  ctx.lineTo(t.x + 24, t.y);
  ctx.moveTo(t.x, t.y - 24);
  ctx.lineTo(t.x, t.y - 8);
  ctx.moveTo(t.x, t.y + 8);
  ctx.lineTo(t.x, t.y + 24);
  ctx.stroke();
  ctx.restore();
}
