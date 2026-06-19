import "server-only";
import type { ZodType } from "zod";
import { getSession, type SessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/roles";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ActionContext = {
  user: SessionUser;
  ip: string | null;
};

type ActionConfig<S> = {
  /** Módulo para auditoria (ex.: 'rh', 'financeiro'). */
  modulo: string;
  /** Ação para auditoria (ex.: 'criar-usuario'). */
  acao: string;
  /** Recurso da permissão fina. Se ausente, só exige sessão. */
  recurso?: string;
  /** Ação da permissão (default = `acao`). */
  permissao?: string;
  /** Gate rígido por perfil (além da permissão fina). */
  roles?: Role[];
  /** Schema Zod do input. */
  schema?: ZodType<S>;
  /** Nome do model Prisma para auditoria. */
  entidade?: string;
  /** Extrai o id da entidade do resultado, para auditoria. */
  entidadeId?: (data: unknown) => string | undefined;
  /** Auditar (default true). */
  audit?: boolean;
  /**
   * Captura o estado anterior da entidade ANTES da execução, para auditoria
   * "valor anterior × valor novo". O retorno vai em `detalhe.antes`; o input vira `detalhe.novo`.
   */
  capturarAntes?: (input: S) => Promise<unknown>;
  /** Chaves do input a OMITIR da auditoria (ex.: "senha"). */
  redact?: string[];
};

/**
 * Define uma Server Action protegida. Encadeia, na ordem:
 * sessão → perfil/permissão → validação Zod → execução → auditoria automática.
 */
export function defineAction<S, T>(
  config: ActionConfig<S>,
  handler: (input: S, ctx: ActionContext) => Promise<T>,
): (raw: S) => Promise<ActionResult<T>> {
  return async (raw: S): Promise<ActionResult<T>> => {
    const session = await getSession();
    if (!session) return { ok: false, error: "Não autenticado." };
    const user = session.user;

    if (user.mustChangePassword) {
      return { ok: false, error: "Troca de senha pendente." };
    }
    if (!user.ativo) {
      return { ok: false, error: "Usuário inativo." };
    }

    const ip = await getClientIp();

    // Gate por perfil
    if (config.roles && !config.roles.includes(user.role)) {
      await maybeAudit(config, { user, ip }, "bloqueado");
      return { ok: false, error: "Sem permissão." };
    }

    // Permissão fina
    if (config.recurso) {
      const allowed = await can(user.role, config.recurso, config.permissao ?? config.acao);
      if (!allowed) {
        await maybeAudit(config, { user, ip }, "bloqueado");
        return { ok: false, error: "Sem permissão." };
      }
    }

    // Validação
    let input = raw;
    if (config.schema) {
      const parsed = config.schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
          fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
      }
      input = parsed.data;
    }

    // Execução + auditoria
    try {
      const antes = config.capturarAntes ? await config.capturarAntes(input) : undefined;
      const data = await handler(input, { user, ip });
      if (config.audit !== false) {
        const inputLog =
          config.redact && input && typeof input === "object"
            ? Object.fromEntries(
                Object.entries(input as Record<string, unknown>).filter(([k]) => !config.redact!.includes(k)),
              )
            : input;
        await logAudit({
          userId: user.id,
          modulo: config.modulo,
          acao: config.acao,
          resultado: "sucesso",
          entidade: config.entidade,
          entidadeId: config.entidadeId?.(data),
          detalhe: antes !== undefined ? { antes, novo: inputLog } : inputLog,
          ip,
        });
      }
      return { ok: true, data };
    } catch (err) {
      console.error(`[action:${config.modulo}/${config.acao}]`, err);
      await maybeAudit(config, { user, ip }, "falha", err);
      const message =
        err instanceof ActionError ? err.message : "Erro ao processar a solicitação.";
      return { ok: false, error: message };
    }
  };
}

async function maybeAudit<S>(
  config: ActionConfig<S>,
  ctx: ActionContext,
  resultado: "falha" | "bloqueado",
  err?: unknown,
) {
  if (config.audit === false) return;
  await logAudit({
    userId: ctx.user.id,
    modulo: config.modulo,
    acao: config.acao,
    resultado,
    entidade: config.entidade,
    detalhe: err instanceof Error ? { erro: err.message } : undefined,
    ip: ctx.ip,
  });
}

/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {}
