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
 * Quem está sendo autorizado. `can()` recebe o SUJEITO, não o papel — mudança de assinatura
 * deliberada da Onda D (§8.1 do plano de Setor × Contratação × Perfil de acesso): uma assinatura
 * retrocompatível deixaria qualquer call-site esquecido continuar resolvendo pela matriz legada,
 * que é **fail-open com cara de sucesso**. Quebrando a assinatura, o compilador enumera os sites.
 *
 * Os campos de perfil (`superUsuario`, `perfilId`) já vêm do `getSession()` desde a Onda A e são
 * o que `permissaoEfetiva` consome quando o corpo de `can()` for religado no motor novo.
 */
export type SubjectAutorizacao = {
  id: string;
  role: Role;
  ativo: boolean;
  superUsuario: boolean;
  perfilId: string | null;
};

/**
 * LEGADO — matriz por `role`, direto da tabela `Permissao`. admin tem bypass total.
 *
 * Continua exportada porque duas coisas legítimas ainda precisam perguntar "o que o papel X
 * poderia": o **piso de sócio** em `requirePermission` (`can(role) || can("supervisor")`) e o
 * **arnês de equivalência**, que precisa reconstruir a matriz antiga para comparar com a nova.
 * Nenhum gate novo deve chamar isto — use `can(subject, ...)`.
 */
export async function canRole(role: Role, recurso: string, acao: string): Promise<boolean> {
  if (role === "admin") return true;
  const map = await loadRole(role);
  return map.get(`${recurso}:${acao}`) ?? false;
}

/**
 * Verifica se o usuário pode executar `recurso:acao`.
 *
 * HOJE delega para `canRole(subject.role, ...)` — **zero mudança de comportamento**. O corpo é
 * trocado por `permissaoEfetiva(subject, ...)` num commit próprio, pequeno e revisável, depois
 * que todos os call-sites já estiverem passando o sujeito e o gate de equivalência estiver verde.
 * Separar a quebra de assinatura (diff grande, comportamento idêntico) do religamento do motor
 * (diff de 3 linhas, comportamento novo) é o que torna o corte auditável.
 */
export async function can(subject: SubjectAutorizacao, recurso: string, acao: string): Promise<boolean> {
  return canRole(subject.role, recurso, acao);
}

/**
 * Visibilidade de informações financeiras (margem, custo, valor de contrato, faturamento).
 * Permitido a quem tem a permissão `financeiro:ver` OU é sócio ativo (registro `Socio`).
 * Centraliza a regra para uso consistente nas páginas/queries financeiras.
 */
export async function podeVerFinanceiro(user: SubjectAutorizacao): Promise<boolean> {
  if (await can(user, "financeiro", "ver")) return true;
  const socio = await prisma.socio.findUnique({ where: { userId: user.id }, select: { ativo: true } });
  return socio?.ativo === true;
}
