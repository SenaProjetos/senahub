import "server-only";
import { LruCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

/**
 * Motor de permissão por Perfil de acesso (Onda A da separação Setor × Contratação × Perfil).
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§5.1, §5.2)
 *
 * ISOLADO DE PROPÓSITO de `lib/permissions.ts`: `can()` continua sendo a ÚNICA fonte real de
 * autorização até a Onda D fazer o codemod dos call-sites. Nada aqui é chamado por
 * `with-action.ts`/`requirePermission` ainda — esta função só é exercida pelo arnês de
 * equivalência (`scripts/checar-equivalencia-permissoes.ts`) enquanto a Onda B não semeia
 * perfis reais. Com `perfilId` nulo para todo mundo, `permissaoEfetiva` resolve `false` para
 * tudo que não seja `superUsuario` — é o comportamento esperado nesta onda, não um bug.
 *
 * Resolução (nesta ordem — a ordem É a garantia de segurança):
 *   1. usuário inativo            → nega
 *   2. superUsuario                → concede (bypass total, não passa pela matriz — mesmo
 *                                    espírito do `role === "admin"` em `can()`: bypass como
 *                                    linha editável de tabela é a falha que este motor evita)
 *   3. override não expirado       → vale o override, inclusive para NEGAR o que o perfil concede
 *   4. permissão do perfil         → default negado se não houver linha
 *
 * Não há passo de Setor: Setor nunca concedeu nem concederá permissão (decisão do dono,
 * 2026-07-27 — a regra "Diretoria vê tudo" foi deliberadamente rejeitada pelo conselho).
 */

export type SubjectPermissao = {
  id: string;
  ativo: boolean;
  superUsuario: boolean;
  perfilId: string | null;
};

/** "recurso:acao" → permitido, por perfil. Mesmo padrão de `lib/permissions.ts`, chave própria. */
const cachePerfil = new LruCache<string, Map<string, boolean>>({ max: 64, ttlMs: 10 * 60_000 });

async function loadPerfil(perfilId: string): Promise<Map<string, boolean>> {
  const cached = cachePerfil.get(perfilId);
  if (cached) return cached;

  const rows = await prisma.permissaoPerfil.findMany({ where: { perfilId } });
  const map = new Map<string, boolean>();
  for (const r of rows) map.set(`${r.recurso}:${r.acao}`, r.permitido);
  cachePerfil.set(perfilId, map);
  return map;
}

/** Invalida o cache de um perfil (chamar ao editar a matriz do perfil). */
export function invalidatePerfil(perfilId?: string) {
  if (perfilId) cachePerfil.delete(perfilId);
  else cachePerfil.clear();
}

/**
 * Override individual. Deliberadamente NÃO CACHEADO (§5.2): é onde mora todo bug de
 * invalidação em sistema de permissão, e overrides devem valer imediatamente — inclusive
 * para revogar. `getSession()` já paga um round-trip ao banco por request; este é outro,
 * pequeno e indexado por `userId`.
 */
async function overrideVigente(userId: string, recurso: string, acao: string): Promise<boolean | null> {
  const row = await prisma.permissaoUsuario.findUnique({
    where: { userId_recurso_acao: { userId, recurso, acao } },
    select: { permitido: true, expiraEm: true },
  });
  if (!row) return null;
  if (row.expiraEm && row.expiraEm.getTime() < Date.now()) return null;
  return row.permitido;
}

/**
 * TODAS as permissões efetivas do usuário, de uma vez: `["recurso:acao", ...]`.
 *
 * Existe para o menu. Filtrar 41 itens de navegação chamando `permissaoEfetiva` item a item
 * seriam 41 consultas por render — diferente das 1-3 por página que `can()` custa, e
 * indefensável. Aqui são **duas** leituras: a matriz do perfil (que já é LRU) e um único
 * `findMany` dos overrides do usuário.
 *
 * Isto **não** é um cache de override: o resultado é calculado a cada chamada e serve àquele
 * render. Uma revogação continua valendo no próximo request, que é a garantia de §5.2 — o que
 * se evita aqui é repetir a MESMA leitura N vezes dentro de um render, não reaproveitá-la entre
 * requests.
 *
 * `superUsuario` recebe o catálogo inteiro: é o mesmo bypass de `permissaoEfetiva`, materializado
 * para que o consumidor (puro, client-side) não precise conhecer o conceito.
 */
export async function permissoesEfetivas(subject: SubjectPermissao): Promise<string[]> {
  if (!subject.ativo) return [];

  const { PERMISSOES_CATALOGO } = await import("@/lib/permissions-catalog");
  const todas = PERMISSOES_CATALOGO.flatMap((r) => r.acoes.map((a) => `${r.recurso}:${a.acao}`));
  if (subject.superUsuario) return todas;

  const doPerfil = subject.perfilId ? await loadPerfil(subject.perfilId) : new Map<string, boolean>();
  const overrides = await prisma.permissaoUsuario.findMany({
    where: { userId: subject.id },
    select: { recurso: true, acao: true, permitido: true, expiraEm: true },
  });

  const agora = Date.now();
  const porOverride = new Map<string, boolean>();
  for (const o of overrides) {
    if (o.expiraEm && o.expiraEm.getTime() < agora) continue;
    porOverride.set(`${o.recurso}:${o.acao}`, o.permitido);
  }

  // Mesma ordem de resolução de `permissaoEfetiva`: override vence o perfil, inclusive negando.
  return todas.filter((chave) => porOverride.get(chave) ?? doPerfil.get(chave) ?? false);
}

/** Verifica se o subject pode executar `recurso:acao` pelo motor de Perfil de acesso. */
export async function permissaoEfetiva(subject: SubjectPermissao, recurso: string, acao: string): Promise<boolean> {
  if (!subject.ativo) return false;
  if (subject.superUsuario) return true;

  const override = await overrideVigente(subject.id, recurso, acao);
  if (override !== null) return override;

  if (!subject.perfilId) return false;
  const map = await loadPerfil(subject.perfilId);
  return map.get(`${recurso}:${acao}`) ?? false;
}
