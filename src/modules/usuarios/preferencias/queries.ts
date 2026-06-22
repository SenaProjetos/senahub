import "server-only";
import { prisma } from "@/lib/prisma";

/** Preferências (chave-valor) do usuário (E8). */
export async function getPreferencias(userId: string): Promise<Record<string, unknown>> {
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  return (p?.dados as Record<string, unknown> | null) ?? {};
}

/**
 * Filtra `userIds` mantendo apenas os que NÃO optaram por sair da categoria.
 * Por padrão (sem pref salva) o usuário RECEBE a notificação.
 * Chave de pref = `notif_<categoria>`, valor `false` = opt-out.
 */
export async function filtrarPorCategoria(userIds: string[], categoria: string): Promise<string[]> {
  if (userIds.length === 0) return [];
  const chave = `notif_${categoria}`;
  const prefs = await prisma.userPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, dados: true },
  });
  const optOut = new Set(
    prefs
      .filter((p) => (p.dados as Record<string, unknown>)?.[chave] === false)
      .map((p) => p.userId),
  );
  return userIds.filter((id) => !optOut.has(id));
}
