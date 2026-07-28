import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/roles";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  ativo: boolean;
  mustChangePassword: boolean;
  image?: string | null;
  /** Sócio ativo (registro Socio) — recebe acesso de LEITURA elevado (piso de supervisor). */
  ehSocio: boolean;
  /**
   * Motor de Perfil de acesso (Onda A da separação Setor × Contratação × Perfil — plano em
   * docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md). INERTE nesta onda:
   * `perfilId` é `null` para todo mundo até a Onda B semear perfis reais, então
   * `escopoGlobalPerfil` resolve `false` para todo mundo. NENHUM gate hoje lê estes dois
   * campos — `acessoGlobal()`/`requireRole`/`requirePermission` continuam 100% sobre `role`.
   * Existem agora para o arnês de equivalência (§6.2) rodar contra dado real desde já, e para
   * a Onda D não precisar voltar a mexer neste arquivo.
   */
  perfilId: string | null;
  escopoGlobalPerfil: boolean;
};

/** Sessão atual (ou null). Memoizada por request. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const base = session.user as unknown as Omit<SessionUser, "ehSocio" | "perfilId" | "escopoGlobalPerfil">;

  // Sócio + perfil/superUsuário num único round-trip (mesmo lookup que já existia, ampliado).
  const { prisma } = await import("@/lib/prisma");
  const dados = await prisma.user.findUnique({
    where: { id: base.id },
    select: { perfilId: true, superUsuario: true, socio: { select: { ativo: true } } },
  });

  const { permissaoEfetiva } = await import("@/lib/permissao-efetiva");
  const escopoGlobalPerfil = await permissaoEfetiva(
    {
      id: base.id,
      ativo: base.ativo,
      superUsuario: dados?.superUsuario ?? false,
      perfilId: dados?.perfilId ?? null,
    },
    "escopo",
    "global",
  );

  return {
    user: {
      ...base,
      ehSocio: dados?.socio?.ativo === true,
      perfilId: dados?.perfilId ?? null,
      escopoGlobalPerfil,
    } as SessionUser,
    session: session.session,
  };
});

/** Exige sessão; redireciona para login se ausente. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  return session.user;
}

/**
 * Exige um dos perfis informados; senão, sem permissão.
 * Sócio ativo tem piso de supervisor: passa em qualquer página que o supervisor acessaria
 * (leitura/gestão), mas não em páginas restritas só a admin (destrutivas/config).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  const ok = roles.includes(user.role) || (user.ehSocio && roles.includes("supervisor"));
  if (!ok) redirect("/sem-permissao");
  return user;
}

/**
 * Exige permissão fina `recurso:acao` (admin tem bypass); senão, sem permissão.
 * Sócio ativo herda as permissões do supervisor (acesso de leitura/gestão elevado).
 */
export async function requirePermission(recurso: string, acao: string): Promise<SessionUser> {
  const { can } = await import("@/lib/permissions");
  const user = await requireUser();
  const ok = (await can(user.role, recurso, acao)) || (user.ehSocio && (await can("supervisor", recurso, acao)));
  if (!ok) redirect("/sem-permissao");
  return user;
}
