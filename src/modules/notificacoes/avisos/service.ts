import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/roles";
import type { CriarAvisoInput } from "./schemas";

type AlvoInput = Pick<
  CriarAvisoInput,
  "alvoTipo" | "alvoRoles" | "userIds" | "incluirClientes"
>;

/** Mantém só valores que são roles válidas (defensivo contra input inválido). */
export function rolesValidas(roles: string[]): Role[] {
  const set = new Set<string>(ROLES);
  return roles.filter((r): r is Role => set.has(r));
}

/**
 * Monta o `where` de usuários-alvo a partir da seleção. PURA (sem I/O) para
 * ser testável — a resolução real dos ids fica em `resolverDestinatarios`.
 */
export function whereDoAlvo(input: AlvoInput): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { ativo: true };
  if (input.alvoTipo === "usuarios") {
    return { ...base, id: { in: input.userIds } };
  }
  if (input.alvoTipo === "categoria") {
    return { ...base, role: { in: rolesValidas(input.alvoRoles) } };
  }
  // todos
  return input.incluirClientes ? base : { ...base, role: { not: "cliente" } };
}

/** Ids dos destinatários resolvidos do alvo, sempre excluindo o autor. */
export async function resolverDestinatarios(
  input: AlvoInput,
  autorId: string,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: whereDoAlvo(input),
    select: { id: true },
  });
  return users.map((u) => u.id).filter((id) => id !== autorId);
}
