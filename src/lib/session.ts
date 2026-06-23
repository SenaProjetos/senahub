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
};

/** Sessão atual (ou null). Memoizada por request. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const base = session.user as unknown as Omit<SessionUser, "ehSocio">;
  // Sócio ativo: acesso de leitura elevado. Lookup leve, memoizado por request.
  const { prisma } = await import("@/lib/prisma");
  const socio = await prisma.socio.findUnique({ where: { userId: base.id }, select: { ativo: true } });
  return {
    user: { ...base, ehSocio: socio?.ativo === true } as SessionUser,
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
