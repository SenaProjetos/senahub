import type { TipoPix } from "@/modules/rh/contas/pix";
import { agencia, conta, rg } from "./bancarios";
import { cep } from "./cep";
import { chaveNfe } from "./chave-nfe";
import { campoPix } from "./chave-pix";
import { cnpj, cpf, cpfCnpj } from "./cpf-cnpj";
import { email } from "./email";
import { telefone } from "./telefone";
import type { TipoCampo } from "./tipo";

export type { TipoCampo } from "./tipo";

export type NomeCampo =
  | "cpf" | "cnpj" | "cpfCnpj" | "telefone" | "cep" | "email" | "rg" | "agencia" | "conta" | "chaveNfe";

/** Catálogo de campos com formato (spec 2026-10-04). Tipo novo nasce aqui junto com o campo. */
export const CAMPOS: Record<NomeCampo, TipoCampo> = {
  cpf, cnpj, cpfCnpj, telefone, cep, email, rg, agencia, conta, chaveNfe,
};

/** Chave PIX antes de escolher o tipo: o campo fica desabilitado e aceita qualquer coisa. */
const TEXTO_LIVRE: TipoCampo = {
  mascarar: (t) => t,
  normalizar: (t) => t.trim(),
  validar: () => true,
  limpo: () => true,
  essencia: (t) => t.trim(),
  significativo: () => true,
  mensagem: "",
  inputMode: "text",
  placeholder: "",
};

export function campoDe(nome: NomeCampo | "chavePix", tipoPix?: TipoPix): TipoCampo {
  if (nome === "chavePix") return tipoPix ? campoPix(tipoPix) : TEXTO_LIVRE;
  return CAMPOS[nome];
}

export function mensagemDe(campo: TipoCampo, texto: string): string {
  return campo.motivo?.(texto) || campo.mensagem;
}

const alfanum = (s: string) => s.toLowerCase().replace(/[^0-9a-z@]/g, "");

/**
 * "O mesmo valor" (legado × novo, spec D4): mesmo texto aparado, ou mesma essência não vazia (o
 * legado `12345678900` exibido como `123.456.789-00` pela máscara conta como não mexido).
 */
export function mesmoValor(campo: TipoCampo, a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const e = campo.essencia(a);
  return e !== "" && e === campo.essencia(b);
}

/**
 * Texto do campo ao abrir: o válido aparece mascarado; o legado que não é limpo ("3333-4444
 * ramal 12") aparece exatamente como está; o limpo inválido aparece mascarado só se a máscara não
 * apagar nada do que estava gravado (senão a pessoa veria um campo vazio ou cortado).
 */
export function exibicaoInicial(campo: TipoCampo, valor: string): string {
  if (!campo.limpo(valor)) return valor;
  const m = campo.mascarar(valor);
  if (campo.validar(valor)) return m;
  return alfanum(m) === alfanum(valor) ? m : valor;
}

/**
 * Formas em que o mesmo valor pode estar gravado (formato padrão, legado só com dígitos, como
 * veio) — para buscas de duplicidade por igualdade enquanto o legado não foi normalizado.
 */
export function variantesDoValor(campo: TipoCampo, valor: string): string[] {
  return [...new Set([campo.normalizar(valor), campo.essencia(valor), valor.trim()])].filter(Boolean);
}
