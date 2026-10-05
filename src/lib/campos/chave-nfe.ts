import { soDigitos } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

/**
 * Chave de acesso da NF-e/NFS-e/CT-e: 44 dígitos, o último é o dígito verificador (módulo 11,
 * pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → DV 0). Grava os 44 dígitos corridos
 * (formato da SEFAZ); os grupos de 4 são só a máscara de exibição.
 */
export function chaveNfeValida(texto: string): boolean {
  const c = soDigitos(texto);
  if (!/^\d{44}$/.test(c)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

export const chaveNfe: TipoCampo = {
  mascarar: (t) => soDigitos(t).slice(0, 44).replace(/(\d{4})(?=\d)/g, "$1 "),
  normalizar: (t) => (chaveNfeValida(t) ? soDigitos(t) : t.trim()),
  validar: (t) => t.trim() === "" || chaveNfeValida(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "Chave da NF inválida: são 44 dígitos e o último confere os outros. Confira na nota.",
  inputMode: "numeric",
  placeholder: "44 dígitos",
};
