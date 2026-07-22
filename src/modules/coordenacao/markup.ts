/**
 * Coordenação BIM — modelo PURO de marcações 2D (seta/círculo/texto) sobre o
 * snapshot de um apontamento. Sem canvas/DOM aqui — só o shape data + serialização;
 * o desenho de fato (ctx.fill/stroke) é responsabilidade do editor (client, F3).
 */
export type Ponto2D = { x: number; y: number };

export type FormaSeta = { tipo: "seta"; inicio: Ponto2D; fim: Ponto2D };
export type FormaCirculo = { tipo: "circulo"; centro: Ponto2D; raio: number };
export type FormaTexto = { tipo: "texto"; posicao: Ponto2D; texto: string };
export type Forma = FormaSeta | FormaCirculo | FormaTexto;

export function criarSeta(inicio: Ponto2D, fim: Ponto2D): FormaSeta {
  return { tipo: "seta", inicio, fim };
}

/** Raio = distância do centro até o ponto onde o usuário soltou o clique (borda do círculo). */
export function criarCirculo(centro: Ponto2D, borda: Ponto2D): FormaCirculo {
  const raio = Math.hypot(borda.x - centro.x, borda.y - centro.y);
  return { tipo: "circulo", centro, raio };
}

export function criarTexto(posicao: Ponto2D, texto: string): FormaTexto {
  return { tipo: "texto", posicao, texto };
}

/** Descarta formas degeneradas (seta/círculo de comprimento ~0, texto vazio) antes de salvar. */
export function formaValida(forma: Forma): boolean {
  if (forma.tipo === "seta") {
    return Math.hypot(forma.fim.x - forma.inicio.x, forma.fim.y - forma.inicio.y) >= 2;
  }
  if (forma.tipo === "circulo") return forma.raio >= 2;
  return forma.texto.trim().length > 0;
}

export function serializarFormas(formas: readonly Forma[]): string {
  return JSON.stringify(formas);
}

export function desserializarFormas(json: string): Forma[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Forma[]) : [];
  } catch {
    return [];
  }
}
