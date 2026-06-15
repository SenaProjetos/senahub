import "server-only";
import { prisma } from "@/lib/prisma";

/** Preferências (chave-valor) do usuário (E8). */
export async function getPreferencias(userId: string): Promise<Record<string, unknown>> {
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  return (p?.dados as Record<string, unknown> | null) ?? {};
}
