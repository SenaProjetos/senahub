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
};

/** Sessão atual (ou null). Memoizada por request. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    user: session.user as unknown as SessionUser,
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

/** Exige um dos perfis informados; senão, sem permissão. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/sem-permissao");
  return user;
}

/** Exige permissão fina `recurso:acao` (admin tem bypass); senão, sem permissão. */
export async function requirePermission(recurso: string, acao: string): Promise<SessionUser> {
  const { can } = await import("@/lib/permissions");
  const user = await requireUser();
  if (!(await can(user.role, recurso, acao))) redirect("/sem-permissao");
  return user;
}
