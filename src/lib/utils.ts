import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Converte Date | string (ISO ou yyyy-mm-dd) em Date local; null se inválido. */
function paraData(d: Date | string | null | undefined): Date | null {
  if (d == null) return null
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? null : parsed
}

/** Moeda BRL: R$ 81.000,00 */
export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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
