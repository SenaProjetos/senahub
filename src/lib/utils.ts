import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Rótulo de revisão de arquivo: 1 → R01, 2 → R02, 10 → R10 (convenção de engenharia,
 * substitui o antigo v1/v2). Zero-padded a 2 dígitos; a partir de 100 usa o tamanho real.
 */
export function rotuloRevisao(n: number): string {
  return `R${String(n).padStart(2, "0")}`
}

/** Converte Date | string (ISO ou yyyy-mm-dd) em Date local; null se inválido. */
function paraData(d: Date | string | null | undefined): Date | null {
  if (d == null) return null
  let date: Date
  if (d instanceof Date) {
    date = d
  } else {
    // yyyy-mm-dd puro: já é uma data local (sem fuso).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    date = new Date(d)
  }
  if (isNaN(date.getTime())) return null
  // Campos @db.Date do Prisma chegam como meia-noite UTC — seja como objeto Date
  // ou já serializados em string ISO ("2026-07-15T00:00:00.000Z"). Reconstrói em
  // horário local com o mesmo ano/mês/dia para não exibir um dia a menos em fusos
  // atrás de UTC (ex.: America/Sao_Paulo).
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }
  return date
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
