/**
 * Conversão entre o espaço VISUAL da página (o que o usuário vê no viewer) e o espaço de
 * usuário do PDF (onde o `pdf-lib` desenha) — itens 20/25. Puro e testado, no mesmo molde de
 * `coordenacao/viewer/coords.ts` (three↔IFC).
 *
 * São dois sistemas diferentes, e confundi-los põe o carimbo no lugar errado:
 *
 * - **Visual** — origem no canto superior esquerdo, `y` cresce PRA BAIXO, normalizado 0..1.
 *   É o que o cliente grava em `Pendencia.x/y`: a posição vem de `getBoundingClientRect()` do
 *   overlay, que cobre o canvas dimensionado por `page.getViewport()` do pdf.js — ou seja, a
 *   rotação `/Rotate` JÁ ESTÁ aplicada aí.
 * - **Usuário do PDF** — origem no canto inferior esquerdo, `y` cresce PRA CIMA, em pontos, e
 *   **sem** a rotação aplicada: `/Rotate` é instrução pro leitor, o conteúdo do arquivo continua
 *   na orientação original. `pdf-lib` desenha nesse espaço.
 *
 * `largura`/`altura` aqui são sempre as da MediaBox **não rotacionada** (o que
 * `PDFPage.getSize()` devolve). Numa página `/Rotate 90` ou `270` a caixa visual é a
 * transposta dela.
 *
 * Verificado contra uma prancha real `/Rotate 270` do acervo (A1 de estrutural): os três
 * pontos de prova (0,05/0,05 · 0,5/0,5 · 0,95/0,95) caíram exatamente nos cantos e no centro
 * visuais esperados.
 */

export type Rotacao = 0 | 90 | 180 | 270;
export type PontoPdf = { x: number; y: number };

/** Normaliza o ângulo de `/Rotate` (pode vir negativo ou > 360) para 0|90|180|270. */
export function normalizarRotacao(angulo: number): Rotacao {
  const r = ((Math.round(angulo / 90) * 90) % 360 + 360) % 360;
  return r as Rotacao;
}

/** Tamanho da página COMO O USUÁRIO VÊ — transposto quando a rotação é de um quarto de volta. */
export function tamanhoVisual(largura: number, altura: number, rot: Rotacao): { largura: number; altura: number } {
  return rot === 90 || rot === 270 ? { largura: altura, altura: largura } : { largura, altura };
}

/**
 * Visual normalizado (u, v — `v` medido do TOPO) → ponto no espaço de usuário do PDF.
 *
 * As quatro variantes saem de mapear os cantos: girar a folha 90° no sentido horário leva o
 * canto inferior-esquerdo da página pro topo-esquerdo da tela, e assim por diante.
 */
export function paraPdf(u: number, v: number, largura: number, altura: number, rot: Rotacao): PontoPdf {
  if (rot === 90) return { x: v * largura, y: u * altura };
  if (rot === 180) return { x: largura - u * largura, y: v * altura };
  if (rot === 270) return { x: largura - v * largura, y: altura - u * altura };
  return { x: u * largura, y: altura - v * altura };
}

/** Inversa de `paraPdf` — existe para o teste de ida-e-volta fechar o ciclo nas 4 rotações. */
export function paraVisual(p: PontoPdf, largura: number, altura: number, rot: Rotacao): { u: number; v: number } {
  if (rot === 90) return { u: p.y / altura, v: p.x / largura };
  if (rot === 180) return { u: (largura - p.x) / largura, v: p.y / altura };
  if (rot === 270) return { u: (altura - p.y) / altura, v: (largura - p.x) / largura };
  return { u: p.x / largura, v: (altura - p.y) / altura };
}

/**
 * Ângulo (em graus, convenção do `pdf-lib`: anti-horário) para o texto sair **em pé** na
 * orientação em que o usuário lê a página.
 *
 * Confirmado empiricamente na prancha `/Rotate 270`: desenhar com `+rot` sai legível, com
 * `-rot` sai de cabeça pra baixo. O motivo é que `/Rotate` gira no sentido HORÁRIO e o
 * `pdf-lib` gira no ANTI-horário, então os dois se cancelam com o MESMO sinal, não com o
 * oposto — que é a armadilha óbvia aqui.
 */
export function anguloTextoEmPe(rot: Rotacao): number {
  return rot;
}

/**
 * Retângulo visual (dois cantos normalizados) → retângulo no espaço do PDF, pronto pro
 * `drawRectangle`.
 *
 * Converte os DOIS cantos e tira a caixa envolvente, em vez de converter a origem e escalar
 * largura/altura separadamente. Como as rotações são múltiplas de 90°, os eixos trocam de
 * papel em 90/270 — escalar "largura visual" pela largura da MediaBox daria uma caixa
 * achatada nessas páginas. Converter os cantos não tem como errar isso.
 */
export function caixaPdf(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  largura: number,
  altura: number,
  rot: Rotacao,
): { x: number; y: number; width: number; height: number } {
  const a = paraPdf(u0, v0, largura, altura, rot);
  const b = paraPdf(u1, v1, largura, altura, rot);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
