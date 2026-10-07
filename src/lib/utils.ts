import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { paraData } from "./data"

export { paraData, inicioDoDia } from "./data"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Rótulo de revisão de arquivo a partir do número INTERNO (`Upload.versao` /
 * `DocumentoRevisao.numero`, que começam em 1): 1 → R00, 2 → R01, 11 → R10.
 *
 * Convenção de engenharia: R00 é a emissão original e R01 a PRIMEIRA revisão — o carimbo e o
 * relatório de apontamentos já seguiam assim; a tela mostrava R01 no original. O banco segue
 * 1-based de propósito (nome físico `__v2`, unique de revisão): só o rótulo desloca.
 * Zero-padded a 2 dígitos; a partir de 100 usa o tamanho real.
 */
export function rotuloRevisao(n: number): string {
  return `R${String(Math.max(0, n - 1)).padStart(2, "0")}`
}

/** Moeda BRL: R$ 81.000,00 */
export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Moeda BRL com o sinal sempre escrito: `+R$ 1.234,00`, `−R$ 1.234,00` (menos tipográfico) e
 * `R$ 0,00`. O sinal é a informação; a cor só reforça (valor negativo só em vermelho falha para
 * quem não distingue as cores). Sem espaço entre o sinal e o símbolo, como no mock do Financeiro.
 */
export function brlComSinal(v: number): string {
  const abs = brl(Math.abs(v)).replace(/ /g, " ")
  if (v > 0) return `+${abs}`
  if (v < 0) return `−${abs}`
  return abs
}

/** Moeda BRL sem centavos: R$ 81.000 (p/ KPIs/dashboards). */
export function brlInteiro(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

/** Data: 07/06/2026 (vazio se inválida). */
export function formatarData(d: Date | string | null | undefined): string {
  const date = paraData(d)
  return date ? date.toLocaleDateString("pt-BR") : ""
}

/** Data e hora: 07/06/2026 14:30 (vazio se inválida). */
export function formatarDataHora(d: Date | string | null | undefined): string {
  const date = paraData(d)
  if (!date) return ""
  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

/** Mês curto sem ponto: jun */
export function formatarMesCurto(d: Date | string | null | undefined): string {
  const date = paraData(d)
  return date ? date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") : ""
}

/** Dia/mês 2 dígitos: 07/06 */
export function formatarDiaMes(d: Date | string | null | undefined): string {
  const date = paraData(d)
  return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""
}
