import { soDigitos, validarCNPJ, validarCPF, validarCpfCnpj } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

export function mascararCpf(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCnpj(texto: string): string {
  const d = soDigitos(texto).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const vazio = (t: string) => t.trim() === "";

export const cpf: TipoCampo = {
  mascarar: mascararCpf,
  normalizar: (t) => (!vazio(t) && validarCPF(t) ? mascararCpf(t) : t.trim()),
  validar: (t) => vazio(t) || validarCPF(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CPF inválido. Confira os 11 dígitos.",
  inputMode: "numeric",
  placeholder: "000.000.000-00",
};

export const cnpj: TipoCampo = {
  mascarar: mascararCnpj,
  normalizar: (t) => (!vazio(t) && validarCNPJ(t) ? mascararCnpj(t) : t.trim()),
  validar: (t) => vazio(t) || validarCNPJ(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CNPJ inválido. Confira os 14 dígitos.",
  inputMode: "numeric",
  placeholder: "00.000.000/0000-00",
};

const mascararCpfCnpj = (t: string) => (soDigitos(t).length <= 11 ? mascararCpf(t) : mascararCnpj(t));

export const cpfCnpj: TipoCampo = {
  mascarar: mascararCpfCnpj,
  normalizar: (t) => (!vazio(t) && validarCpfCnpj(t) ? mascararCpfCnpj(t) : t.trim()),
  validar: (t) => vazio(t) || validarCpfCnpj(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CPF ou CNPJ inválido. Confira os dígitos.",
  inputMode: "numeric",
  placeholder: "CPF ou CNPJ",
};
