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
   * Motor de Perfil de acesso (plano em
   * docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md).
   * ATIVO desde a Onda D (2026-08-09): `can()` resolve por `permissaoEfetiva` e
   * `acessoGlobal()` lê `superUsuario || escopoGlobalPerfil` — estes campos SÃO a autorização
   * real hoje, não mais um ensaio. (O comentário anterior dizia "inerte, nenhum gate lê" —
   * era verdade na Onda A e virou mentira no flip.)
   */
  perfilId: string | null;
  /**
   * `PerfilAcesso.chave` do perfil acima — slug estável, o identificador que dado histórico
   * usa (ver `DocumentoModelo.perfis`). Vem do mesmo round-trip de `perfilId`, sem custo extra.
   */
  perfilChave: string | null;
  escopoGlobalPerfil: boolean;
  /**
   * Bypass total do motor de Perfil de acesso (equivalente ao `role === "admin"` de `can()`).
   * Exposto na sessão a partir da Onda D porque `can(subject, ...)` recebe o sujeito inteiro e
   * `permissaoEfetiva` consome este campo. Já era lido pelo `getSession` desde a Onda A.
   */
  superUsuario: boolean;
};

/** Sessão atual (ou null). Memoizada por request. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const base = session.user as unknown as Omit<
    SessionUser,
    "ehSocio" | "perfilId" | "perfilChave" | "escopoGlobalPerfil" | "superUsuario"
  >;

  // Sócio + perfil/superUsuário num único round-trip (mesmo lookup que já existia, ampliado).
  const { prisma } = await import("@/lib/prisma");
  const dados = await prisma.user.findUnique({
    where: { id: base.id },
    select: {
      perfilId: true,
      superUsuario: true,
      perfil: { select: { chave: true } },
      socio: { select: { ativo: true } },
    },
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
      perfilChave: dados?.perfil?.chave ?? null,
      superUsuario: dados?.superUsuario ?? false,
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
  const { can, canRole } = await import("@/lib/permissions");
  const user = await requireUser();
  // `canRole("supervisor", ...)` é o piso de sócio — a única pergunta legítima do tipo "o que o
  // papel X poderia" que sobra fora do arnês. Vira override individual (só leitura, §15.7) no
  // religamento do motor.
  const ok = (await can(user, recurso, acao)) || (user.ehSocio && (await canRole("supervisor", recurso, acao)));
  if (!ok) redirect("/sem-permissao");
  return user;
}
