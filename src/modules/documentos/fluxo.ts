import type { Elemento } from "@/modules/documentos/schema";

/**
 * Faixa em fluxo (ADR-0006): a faixa cresce com o conteúdo em vez de cortar o que passa da altura.
 *
 * O Estúdio posiciona elementos em coordenadas absolutas dentro de uma faixa de altura fixa —
 * ótimo para relatório com campo de tamanho previsível, e errado para documento de texto corrido
 * (proposta, contrato, memorial), onde uma cláusula pode ter 1 ou 10 linhas. Em `overflow: hidden`,
 * o excedente some **em silêncio**; é o que os contratos de fábrica tentam evitar hoje chutando a
 * altura por contagem de caracteres (`modelos-fabrica-contrato.ts`).
 *
 * Em fluxo, o desenho vira ORDEM: os elementos são empilhados de cima para baixo, `x` continua
 * sendo o recuo à esquerda e o espaço entre um elemento e o seguinte é preservado como no desenho.
 * Assim um modelo já desenhado sai parecido com o que se vê no editor — a diferença é que o texto
 * empurra o que vem depois em vez de ser cortado.
 *
 * Puro de propósito: é a única parte com decisão real, e fica testável sem DOM.
 */
export type ElementoEmFluxo = {
  elemento: Elemento;
  /** Espaço acima deste elemento, em px (0 no primeiro). */
  espacoAcima: number;
};

/** Elementos que crescem com o texto; os demais mantêm a altura desenhada. */
const TIPOS_DE_TEXTO = new Set(["label", "campo", "paragrafo"]);

export function elementoCresceComTexto(tipo: Elemento["tipo"]): boolean {
  return TIPOS_DE_TEXTO.has(tipo);
}

/**
 * Ordena os elementos da faixa para empilhamento e calcula o espaço entre eles.
 *
 * - Ordem: por `y`; empate desempata por `x` (esquerda → direita), para a saída ser estável.
 * - Espaço: distância entre o topo do elemento e o ponto mais baixo já ocupado. Elementos
 *   sobrepostos (comuns em desenho absoluto) dariam espaço negativo — vira 0, porque em fluxo
 *   não existe sobreposição.
 */
export function organizarFluxo(elementos: readonly Elemento[]): ElementoEmFluxo[] {
  const ordenados = [...elementos].sort((a, b) => a.y - b.y || a.x - b.x);
  let base: number | null = null;
  return ordenados.map((elemento) => {
    const espacoAcima = base === null ? 0 : Math.max(0, elemento.y - base);
    base = Math.max(base ?? elemento.y, elemento.y + elemento.h);
    return { elemento, espacoAcima };
  });
}
