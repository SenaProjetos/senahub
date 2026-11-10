/**
 * Recusas e alertas de campo — **puro**. Spec §3.3 (faixa válida / fora da faixa) e §6.
 * Cada função devolve a mensagem da spec, ou `null` quando o valor é aceito.
 */

import { MSG, type Mensagem } from "./mensagens";

const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Área maior que zero (m²). */
export function validarArea(areaM2: number | null | undefined): Mensagem | null {
  return ehNumero(areaM2) && areaM2 > 0 ? null : MSG.areaInvalida();
}

/** FP maior que 0 e até 1. */
export function validarFp(fp: number | null | undefined): Mensagem | null {
  return ehNumero(fp) && fp > 0 && fp <= 1 ? null : MSG.fpInvalido();
}

/** Nº de apartamentos: inteiro maior que zero. */
export function validarApartamentos(n: number | null | undefined): Mensagem | null {
  return ehNumero(n) && Number.isInteger(n) && n > 0 ? null : MSG.apartamentosInvalido();
}

/** Quantidade (× N) do escopo: inteiro maior ou igual a 1. */
export function validarQuantidadeEscopo(n: number | null | undefined): Mensagem | null {
  return ehNumero(n) && Number.isInteger(n) && n >= 1 ? null : MSG.quantidadeEscopoInvalida();
}

/** Perímetro compatível com a área: P ≥ 4·√A [palpite da spec, aprovado como está]. Só alerta. */
export function verificarPerimetro(areaM2: number, perimetroM: number): Mensagem | null {
  if (!(areaM2 > 0) || !(perimetroM > 0)) return null;
  return perimetroM >= 4 * Math.sqrt(areaM2) - 1e-9 ? null : MSG.perimetroIncompativel();
}

/** Campo obrigatório sem valor padrão (spec §6, primeira linha). */
export function exigirValor(valor: number | string | null | undefined, campo: string): Mensagem | null {
  return valor == null || valor === "" || (typeof valor === "number" && !Number.isFinite(valor))
    ? MSG.campoObrigatorio(campo)
    : null;
}
