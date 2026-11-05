// Pixels da sobreposição 2D: tingir a folha rasterizada e achar onde há tinta. Puro: roda no navegador.

/**
 * Tinge no lugar um buffer RGBA: RGB = `cor`, alfa = round(255 × (1 − luminância do pixel original)).
 * Fundo branco some, traço preto fica opaco na cor da camada, cinza vira tinta parcial.
 */
export function tingir(dados: Uint8ClampedArray, cor: [number, number, number]): void {
  const [r, g, b] = cor;
  for (let i = 0; i < dados.length; i += 4) {
    const lum = (0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2]) / 255;
    dados[i] = r;
    dados[i + 1] = g;
    dados[i + 2] = b;
    dados[i + 3] = Math.round(255 * (1 - lum));
  }
}

/** 1 por pixel onde o alfa passa do `limiar`, 0 no resto. */
export function mascaraDeTinta(dados: Uint8ClampedArray, limiar = 32): Uint8Array {
  const n = dados.length >> 2;
  const mascara = new Uint8Array(n);
  for (let p = 0; p < n; p++) mascara[p] = dados[p * 4 + 3] > limiar ? 1 : 0;
  return mascara;
}

/** `#rrggbb` → [r, g, b]; texto que não é cor vira preto. */
export function hexParaRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
