import { ehDigito, limpoPor, type TipoCampo } from "./tipo";

/**
 * Chave de acesso de nota fiscal eletrônica — dois formatos (o nome `chaveNfe` ficou do primeiro):
 *
 * - **NF-e / CT-e** (produto, frete): 44 caracteres; o último é o dígito verificador (módulo 11, pesos 2 a 9 da direita
 *   para a esquerda; resto 0 ou 1 → DV 0). Com o CNPJ alfanumérico (IN RFB 2.229/2024), as posições 7–20 (o CNPJ do
 *   emitente) podem ter letras maiúsculas, e o DV conta cada caractere como `código ASCII − 48` (dígito vale ele mesmo).
 * - **NFS-e do padrão nacional** (serviço): 50 caracteres — município (7), ambiente (1), tipo de inscrição (1), inscrição
 *   federal (14, alfanumérica com o CNPJ novo), número da nota (13), ano e mês da emissão (AAMM), código numérico (9) e DV
 *   (1). A regra do DV não foi confirmada na documentação oficial: conferimos formato e mês, não o DV — trocar quando a
 *   regra for confirmada com uma chave real.
 *
 * Grava os caracteres corridos, em maiúsculas; os grupos de 4 são só a máscara de exibição.
 */

export type ModeloDaChave = "nfe" | "nfse";

// O CNPJ alfanumérico tem 12 posições com letra possível e os 2 DVs numéricos.
const NFE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;
const NFSE = /^[0-9]{9}[0-9A-Z]{12}[0-9]{29}$/;

/** Letras e dígitos, em maiúsculas — o que a chave guarda. */
const essencia = (t: string) => t.toUpperCase().replace(/[^0-9A-Z]/g, "");

function dvNfeConfere(c: string): boolean {
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += (c.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

/** Qual nota a chave é, já conferida; `null` = não é chave válida de nenhuma das duas. */
export function modeloDaChave(texto: string): ModeloDaChave | null {
  const c = essencia(texto);
  if (c.length === 44) return NFE.test(c) && dvNfeConfere(c) ? "nfe" : null;
  if (c.length === 50) {
    if (!NFSE.test(c)) return null;
    const mes = Number(c.slice(38, 40));
    return mes >= 1 && mes <= 12 ? "nfse" : null;
  }
  return null;
}

export const chaveNfeValida = (texto: string): boolean => modeloDaChave(texto) != null;

const mascararChave = (t: string) => essencia(t).slice(0, 50).replace(/([0-9A-Z]{4})(?=[0-9A-Z])/g, "$1 ");
/** Só a chave e a pontuação de máscara (espaço, ponto, hífen, barra). Letra minúscula conta: a máscara a sobe. */
const limpo = limpoPor((v) => /^[0-9A-Za-z\s./-]*$/.test(v), mascararChave);
const valida = (t: string) => limpo(t) && chaveNfeValida(t);

export const chaveNfe: TipoCampo = {
  mascarar: mascararChave,
  normalizar: (t) => (valida(t) ? essencia(t) : t.trim()),
  validar: (t) => t.trim() === "" || valida(t),
  limpo,
  essencia,
  significativo: (c) => ehDigito(c) || /[A-Za-z]/.test(c),
  mensagem: "Chave de acesso inválida: a da NFS-e tem 50 caracteres e a da NF-e tem 44, com o último conferindo os outros. Confira na nota.",
  inputMode: "text",
  placeholder: "NFS-e: 50 · NF-e: 44 caracteres",
};
