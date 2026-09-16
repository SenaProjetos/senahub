/**
 * Classificação de tamanho de papel (A0–A4) a partir das dimensões da página de um PDF
 * (F4 da spec `2026-09-15-motor-nomenclatura.md`). Pura, sem I/O — a leitura do arquivo em si
 * (`tamanho-papel-pdf.ts`) fica separada porque precisa de `fs` e do catálogo do banco.
 *
 * Dimensões ISO 216 fixas (mm), não lidas do nome do `PranchaCatalogo` — o texto lá
 * ("A1 (594×841)") é só rótulo para humano; usar a tabela fixa evita depender de alguém não
 * editar esse texto por engano.
 */

export type SiglaPapel = "A0" | "A1" | "A2" | "A3" | "A4";

/** Largura × altura em mm, no sentido retrato (a maior dimensão sempre em segundo). */
export const ISO_216_MM: Record<SiglaPapel, readonly [number, number]> = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
};

const PT_PARA_MM = 25.4 / 72;

/** Tolerância absoluta: PDFs plotados têm arredondamento de driver, raramente > 2-3mm. */
const TOLERANCIA_MM = 4;

/**
 * Casa uma dimensão de página (em pontos PDF, 1/72") com A0–A4. Sem `/Rotate`: a classificação
 * já ignora orientação (compara a MAIOR dimensão com a maior do papel, a menor com a menor),
 * então girar a página 90/270° não muda o resultado — não há o que tratar.
 *
 * Fora de qualquer faixa com a tolerância → `null` (não inventa o mais próximo).
 */
export function classificarTamanhoPapel(larguraPt: number, alturaPt: number): SiglaPapel | null {
  if (!(larguraPt > 0) || !(alturaPt > 0)) return null;
  const ladoA = larguraPt * PT_PARA_MM;
  const ladoB = alturaPt * PT_PARA_MM;
  const menor = Math.min(ladoA, ladoB);
  const maior = Math.max(ladoA, ladoB);
  for (const [sigla, [mMenor, mMaior]] of Object.entries(ISO_216_MM) as [SiglaPapel, readonly [number, number]][]) {
    if (Math.abs(menor - mMenor) <= TOLERANCIA_MM && Math.abs(maior - mMaior) <= TOLERANCIA_MM) {
      return sigla;
    }
  }
  return null;
}
