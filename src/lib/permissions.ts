import "server-only";
import { LruCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

/** "recurso:acao" → permitido. Cache por perfil, TTL 10 min. */
const cache = new LruCache<string, Map<string, boolean>>({ max: 16, ttlMs: 10 * 60_000 });

async function loadRole(role: Role): Promise<Map<string, boolean>> {
  const cached = cache.get(role);
  if (cached) return cached;

  const rows = await prisma.permissao.findMany({ where: { role } });
  const map = new Map<string, boolean>();
  for (const r of rows) map.set(`${r.recurso}:${r.acao}`, r.permitido);
  cache.set(role, map);
  return map;
}

/** Invalida o cache de um perfil (chamar ao editar permissões). */
export function invalidatePermissions(role?: Role) {
  if (role) cache.delete(role);
  else cache.clear();
}

/**
 * Verifica se um perfil pode executar `recurso:acao`.
 * admin tem bypass total. Demais consultam a tabela (default: negado).
 */
export async function can(role: Role, recurso: string, acao: string): Promise<boolean> {
  if (role === "admin") return true;
  const map = await loadRole(role);
  return map.get(`${recurso}:${acao}`) ?? false;
}
