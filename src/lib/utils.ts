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

// ── Máscaras de entrada (item 4: cadastro de colaborador) ─────────────
/** 000.000.000-00 */
export function maskCpf(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

/** (00) 00000-0000 */
export function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2")
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2")
}

/** 00000-000 */
export function maskCep(v: string): string {
  return v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2")
}

/** 00.000.000/0000-00 */
export function maskCnpj(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}
