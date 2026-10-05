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
  /** Vazio é válido: obrigatoriedade é do schema. */
  validar(texto: string): boolean;
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
