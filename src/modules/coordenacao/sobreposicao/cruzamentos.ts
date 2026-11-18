// Modo "Cruzamentos" da sobreposição 2D: onde DUAS camadas têm traço no mesmo lugar (candidatas a
// interferência). Reaproveita a grade de ladrilhos do comparador de revisões trocando "pixel diferente"
// por "tinta nas duas". É ajuda visual: nunca cria apontamento. Puro: roda no navegador.
import { TILE, agruparRegioes, type RegiaoDiff } from "@/modules/projetos/pendencias/diff";
import type { Alinhamento, Caixa } from "./transformacao";

/** Ladrilho marcado quando pelo menos `minimo` pixels têm tinta nas duas máscaras. */
export function gradeDeCruzamentos(
  a: Uint8Array,
  b: Uint8Array,
  largura: number,
  altura: number,
  tile = TILE,
  minimo = 4,
): { grade: Uint8Array; cols: number; rows: number } {
  const cols = Math.ceil(largura / tile);
  const rows = Math.ceil(altura / tile);
  const contagem = new Uint32Array(cols * rows);
  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    const linhaTile = Math.floor(y / tile) * cols;
    for (let x = 0; x < largura; x++) {
      const p = linha + x;
      if (a[p] && b[p]) contagem[linhaTile + Math.floor(x / tile)]++;
    }
  }
  const grade = new Uint8Array(cols * rows);
  for (let k = 0; k < grade.length; k++) grade[k] = contagem[k] >= minimo ? 1 : 0;
  return { grade, cols, rows };
}

/** Regiões (em px da máscara) onde as duas camadas se cruzam, maiores primeiro. */
export function cruzamentos(
  a: Uint8Array,
  b: Uint8Array,
  largura: number,
  altura: number,
  tile = TILE,
  minimo = 4,
): RegiaoDiff[] {
  const { grade, cols, rows } = gradeDeCruzamentos(a, b, largura, altura, tile, minimo);
  return agruparRegioes(grade, cols, rows, tile);
}

/**
 * Região em px do canvas → caixa no mundo, pela vista (giro 0) e pela densidade de pixels: assim o
 * retângulo continua no lugar durante o pan/zoom até o recálculo.
 */
export function regiaoParaMundo(
  r: { x: number; y: number; largura: number; altura: number },
  vista: Alinhamento,
  densidade: number,
): Caixa {
  const paraMundo = (px: number, t: number) => (px / densidade - t) / vista.escala;
  return {
    minX: paraMundo(r.x, vista.tx),
    minY: paraMundo(r.y, vista.ty),
    maxX: paraMundo(r.x + r.largura, vista.tx),
    maxY: paraMundo(r.y + r.altura, vista.ty),
  };
}
