/**
 * Medição manual sobre prancha PDF — PURO, sem I/O. O usuário clica pontos em cima do canvas
 * renderizado (pixels); a régua (`escalaPorReferencia`) converte pixel→unidade real a partir de
 * uma medida conhecida, e tudo mais deriva dessa escala.
 */

export type Ponto = { x: number; y: number };

/** Unidade real por pixel, a partir de uma distância conhecida medida na tela. */
export function escalaPorReferencia(distanciaPixels: number, medidaReal: number): number {
  if (distanciaPixels <= 0) throw new Error("Distância em pixels precisa ser maior que zero.");
  if (medidaReal <= 0) throw new Error("Medida real precisa ser maior que zero.");
  return medidaReal / distanciaPixels;
}

function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Soma os segmentos de uma polilinha aberta (pixels) e converte pela escala. */
export function comprimentoPolilinha(pontos: readonly Ponto[], escala: number): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += distancia(pontos[i - 1], pontos[i]);
  return total * escala;
}

/** Área de um polígono fechado (pixels, shoelace) convertida pela escala (ao quadrado). */
export function areaPoligono(pontos: readonly Ponto[], escala: number): number {
  if (pontos.length < 3) return 0;
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const atual = pontos[i];
    const prox = pontos[(i + 1) % pontos.length];
    soma += atual.x * prox.y - prox.x * atual.y;
  }
  return (Math.abs(soma) / 2) * escala * escala;
}
