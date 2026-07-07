import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Converte Date | string (ISO ou yyyy-mm-dd) em Date local; null se inválido. */
function paraData(d: Date | string | null | undefined): Date | null {
  if (d == null) return null
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null
    // Campos @db.Date do Prisma chegam como meia-noite UTC; reconstrói em
    // horário local com o mesmo ano/mês/dia para não exibir um dia a menos
    // em fusos atrás de UTC (ex.: America/Sao_Paulo).
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    }
    return d
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? null : parsed
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
