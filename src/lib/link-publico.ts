/**
 * Regra única de vigência dos links públicos (sem login) — arquivos e inputs.
 * Pura (sem Prisma/`server-only`) para ser testável e usável por qualquer módulo.
 *
 * Convenção compartilhada pelos dois modelos:
 *  - `ativo=false` revoga o link na hora;
 *  - `expiraEm` no passado desliga o link (nulo = não expira).
 */
export type LinkComVigencia = { ativo: boolean; expiraEm: Date | null };

/** Link vale agora? (ativo e não expirado). */
export function linkVigente(link: LinkComVigencia, agora: Date = new Date()): boolean {
  if (!link.ativo) return false;
  if (link.expiraEm && link.expiraEm.getTime() <= agora.getTime()) return false;
  return true;
}
