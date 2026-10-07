/**
 * Contrato de um campo com formato conhecido (spec 2026-10-04-campos-formatados). Puro: o mesmo
 * objeto alimenta a máscara da tela (`InputFormatado`), o schema Zod (`campo.<tipo>()`) e a regra
 * de edição (`exigirCamposValidos`) — a tela nunca aceita o que a action recusa.
 */
export type TipoCampo = {
  /** Máscara enquanto a pessoa digita. Aceita entrada parcial e qualquer pontuação colada. */
  mascarar(texto: string): string;
  /** Formato gravado no banco. Valor inválido volta só aparado, sem perder nada. */
  normalizar(texto: string): string;
  /**
   * Vazio é válido: obrigatoriedade é do schema. Sempre `vazio || (limpo && regra)`: o texto com
   * algo além do valor ("(81) 99999-9999 Maria") é inválido, mesmo que os dígitos passem.
   */
  validar(texto: string): boolean;
  /**
   * O texto é só o valor, com a pontuação da máscara — normalizar não joga nada fora? Fora disso
   * ("3333-4444 ramal 12", "1.234.567 SSP/PE") o legado é "inválido não mexido" (D4): abre como
   * está, salva como está e nunca é reescrito. A saída de `mascarar` é sempre limpa.
   */
  limpo(texto: string): boolean;
  /** O que define "o mesmo valor" (legado × novo): sem pontuação, sem caixa. */
  essencia(texto: string): string;
  /** Caractere que a pessoa digita; os outros são pontuação da máscara (conta para o cursor). */
  significativo(c: string): boolean;
  /** Frase mostrada sob o campo e no `ActionError`. */
  mensagem: string;
  /** Frase específica para um valor, quando a regra tem vários motivos (chave PIX). */
  motivo?(texto: string): string;
  inputMode: "numeric" | "tel" | "email" | "text";
  autoComplete?: string;
  placeholder: string;
};

export const ehDigito = (c: string): boolean => c >= "0" && c <= "9";

export const vazio = (t: string): boolean => t.trim() === "";

/**
 * `limpo` de um tipo: vazio, a forma aceita (`forma`, sobre o texto aparado) ou a própria saída da
 * máscara (entrada parcial enquanto a pessoa digita, que por definição não tem nada a mais).
 */
export function limpoPor(forma: (v: string) => boolean, mascarar: (t: string) => string): (t: string) => boolean {
  return (t) => {
    const v = t.trim();
    return v === "" || forma(v) || mascarar(v) === v;
  };
}

/** Só dígitos, espaço e a pontuação de máscara de documento (. - / e parênteses). */
export const SO_NUMERO_E_MASCARA = /^[0-9\s./()-]*$/;
