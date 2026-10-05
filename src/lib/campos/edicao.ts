import type { TipoCampo } from "./tipo";

export type Edicao = {
  /** Texto do campo antes da tecla. */
  anterior: string;
  /** Texto que o navegador montou depois da tecla (ainda sem máscara). */
  digitado: string;
  /** Posição do cursor no `digitado`. */
  cursor: number;
  /** `InputEvent.inputType` — distingue backspace de delete. */
  inputType?: string;
};

type Campo = Pick<TipoCampo, "mascarar" | "significativo">;

const contar = (s: string, sig: (c: string) => boolean) => [...s].filter(sig).length;

/** Índice logo depois do n-ésimo caractere significativo do texto mascarado. */
function posicaoNoMascarado(texto: string, n: number, sig: (c: string) => boolean): number {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (sig(texto[i]) && ++vistos === n) return i + 1;
  }
  return texto.length;
}

/**
 * Aplica a máscara a uma edição e diz onde o cursor fica. O cursor é contado em caracteres
 * significativos (dígitos, no CPF), não em posição: a pontuação que a máscara põe ou tira não o
 * empurra. Apagar só pontuação não mudaria nada (a máscara a recolocaria e o backspace "travaria"),
 * então leva junto o caractere vizinho.
 */
export function aplicarEdicao(campo: Campo, e: Edicao): { texto: string; cursor: number } {
  const sig = campo.significativo;
  let { digitado, cursor } = e;
  const soPontuacao = digitado.length < e.anterior.length && contar(digitado, sig) === contar(e.anterior, sig);
  if (soPontuacao && e.inputType === "deleteContentBackward") {
    let i = cursor - 1;
    while (i >= 0 && !sig(digitado[i])) i--;
    if (i >= 0) {
      digitado = digitado.slice(0, i) + digitado.slice(i + 1);
      cursor = i;
    }
  } else if (soPontuacao && e.inputType === "deleteContentForward") {
    let i = cursor;
    while (i < digitado.length && !sig(digitado[i])) i++;
    if (i < digitado.length) digitado = digitado.slice(0, i) + digitado.slice(i + 1);
  }
  const texto = campo.mascarar(digitado);
  return { texto, cursor: posicaoNoMascarado(texto, contar(digitado.slice(0, cursor), sig), sig) };
}
