import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Redigidas por SUBSTRING — pegam variantes como `salarioBase`, `senhaAtual`, `pixChave`.
 * Só entram aqui radicais que não aparecem em nome de campo inocente.
 */
const SENSITIVE_KEYS = ["password", "senha", "token", "secret", "hash", "salario", "salário", "pix"];

/**
 * Redigidas por IGUALDADE EXATA. Estes radicais são comuns demais para casar por substring:
 * `banco` bateria em `bancoHoras`/`bancoId` (custos), `conta` em `contaId`/`contatoEmergenciaNome`
 * (financeiro/RH) e `rg` em qualquer palavra com "rg". Redigir esses campos inteiros apagaria
 * trilha de auditoria legítima do financeiro.
 */
const SENSITIVE_EXACT = new Set(["banco", "agencia", "agência", "conta", "cpf", "rg"]);

/** Remove campos sensíveis do detalhe antes de persistir. Recursivo: cobre `{ antes, novo }`. */
export function sanitize(detail: unknown): unknown {
  if (!detail || typeof detail !== "object") return detail;
  if (Array.isArray(detail)) return detail.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    const chave = k.toLowerCase();
    if (SENSITIVE_EXACT.has(chave) || SENSITIVE_KEYS.some((s) => chave.includes(s))) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      out[k] = sanitize(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export type AuditInput = {
  userId?: string | null;
  modulo: string;
  acao: string;
  tipo?: "acao" | "login" | "erro";
  resultado?: "sucesso" | "falha" | "bloqueado" | "rejeitado";
  entidade?: string;
  entidadeId?: string;
  detalhe?: unknown;
  ip?: string | null;
};

/** Registra um evento de auditoria. Nunca lança — auditoria não pode quebrar o fluxo. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        modulo: input.modulo,
        acao: input.acao,
        tipo: input.tipo ?? "acao",
        resultado: input.resultado ?? "sucesso",
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        detalhe: input.detalhe ? (sanitize(input.detalhe) as object) : undefined,
        ip: input.ip ?? (await getClientIp()),
      },
    });
  } catch (err) {
    console.error("[audit] falha ao registrar log:", err);
  }
}
