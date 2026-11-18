// Teclado e clique na sobreposição: onde valem os atalhos (setas, Ctrl+Z, Esc) e o clique repetido. Puro.

/** Janela do duplo clique: o segundo clique, rápido e no mesmo lugar, não é um ponto novo. */
const DUPLO_MS = 400;
const DUPLO_PX = 4;

/** O clique `atual` é a repetição do `anterior` (duplo clique)? Posições em px de tela, `t` em ms. */
export function cliqueRepetido(
  anterior: { x: number; y: number; t: number } | null,
  atual: { x: number; y: number; t: number },
): boolean {
  if (!anterior) return false;
  return atual.t - anterior.t < DUPLO_MS && Math.hypot(atual.x - anterior.x, atual.y - anterior.y) <= DUPLO_PX;
}

/**
 * Só com o foco na página (clicar no desenho deixa o foco no corpo) ou no próprio canvas. Com o foco num botão,
 * aba, campo, seletor ou na divisória da cortina, a tecla é deles: o atalho não a rouba.
 */
export function atalhoNoAlvo(alvo: { tagName: string } | null): boolean {
  if (!alvo) return false;
  return alvo.tagName === "BODY" || alvo.tagName === "CANVAS";
}
