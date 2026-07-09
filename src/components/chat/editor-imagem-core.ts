/**
 * Núcleo PURO do editor de imagem do chat: tipos das shapes vetoriais e as
 * transformações de coordenadas usadas ao girar/cortar o bitmap base.
 * Sem canvas/DOM — testável em node (vitest). O desenho fica no componente.
 *
 * Convenção: shapes vivem em coordenadas da IMAGEM (px do bitmap), nunca da tela.
 */

export type Ponto = { x: number; y: number };

export type Shape =
  | { tipo: "caneta"; pontos: Ponto[]; cor: string; esp: number }
  | { tipo: "seta" | "retangulo" | "elipse"; x1: number; y1: number; x2: number; y2: number; cor: string; esp: number }
  | { tipo: "texto"; x: number; y: number; texto: string; cor: string; tam: number };

/** Mapeia shapes ponto a ponto. */
function mapearShapes(shapes: Shape[], f: (p: Ponto) => Ponto): Shape[] {
  return shapes.map((s) => {
    if (s.tipo === "caneta") return { ...s, pontos: s.pontos.map(f) };
    if (s.tipo === "texto") {
      const p = f({ x: s.x, y: s.y });
      return { ...s, x: p.x, y: p.y };
    }
    const a = f({ x: s.x1, y: s.y1 });
    const b = f({ x: s.x2, y: s.y2 });
    return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/**
 * Rotação de 90° HORÁRIO de uma imagem de altura `alturaOriginal`:
 * (x, y) → (H − y, x). Após girar, largura e altura da imagem trocam.
 */
export function rotacionarShapes90(shapes: Shape[], alturaOriginal: number): Shape[] {
  return mapearShapes(shapes, (p) => ({ x: alturaOriginal - p.y, y: p.x }));
}

/** Translação (recorte): move a origem para (dx, dy) — pontos deslocam −dx, −dy. */
export function transladarShapes(shapes: Shape[], dx: number, dy: number): Shape[] {
  return mapearShapes(shapes, (p) => ({ x: p.x - dx, y: p.y - dy }));
}

/** Espessura de traço em px de IMAGEM, proporcional ao tamanho dela (export fiel ao preview). */
export function espessuraPx(largura: number, altura: number, fator: number): number {
  return Math.max(2, (Math.max(largura, altura) / 300) * fator);
}

/** Tamanho de fonte em px de IMAGEM, idem. */
export function tamanhoTextoPx(largura: number, altura: number, fator: number): number {
  return Math.max(14, (Math.max(largura, altura) / 30) * fator);
}

/** Normaliza o retângulo de corte para dentro dos limites; null se ficar degenerado (< 10 px). */
export function normalizarCorte(
  r: { x1: number; y1: number; x2: number; y2: number },
  largura: number,
  altura: number,
): { x: number; y: number; w: number; h: number } | null {
  const x = Math.max(0, Math.min(r.x1, r.x2));
  const y = Math.max(0, Math.min(r.y1, r.y2));
  const w = Math.min(largura - x, Math.abs(r.x2 - r.x1));
  const h = Math.min(altura - y, Math.abs(r.y2 - r.y1));
  if (w < 10 || h < 10) return null;
  return { x, y, w, h };
}
