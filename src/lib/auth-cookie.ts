/**
 * Prefixo do cookie de sessão — fonte única para o `auth.ts` (que grava e lê o cookie) e para o
 * `middleware.ts` (que só confere se ele existe). Puro, sem `server-only`: o middleware roda em
 * edge e importa este arquivo.
 *
 * Cookie de `localhost` NÃO distingue porta: dois dev servers (um por worktree, ver CLAUDE.md
 * "Parallel worktrees") gravam e sobrescrevem o mesmo `better-auth.session_token`. Logar num
 * derrubava o outro. `AUTH_COOKIE_PREFIX` no `.env` de cada worktree dá a cada um o seu nome
 * (`<prefixo>.session_token`).
 *
 * **Sem a variável o comportamento é o de sempre** (`better-auth`), então produção e quem não
 * configurou nada não mudam. Trocar o valor invalida as sessões abertas naquele servidor.
 */

/** Prefixo padrão do better-auth. */
export const PREFIXO_COOKIE_PADRAO = "better-auth";

/** Só o que é seguro num nome de cookie, e sem ponto (o ponto separa prefixo e nome). */
const PREFIXO_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;

/** `true` se o valor serve como prefixo. Vazio/ausente conta como "não configurado". */
export function prefixoDeCookieValido(valor: string | undefined | null): boolean {
  return typeof valor === "string" && PREFIXO_VALIDO.test(valor.trim());
}

/**
 * Prefixo a usar. Ausente ou inválido cai no padrão — o que reabre o compartilhamento de cookie
 * entre worktrees; por isso o Doctor da Central (`dev doctor`) avisa quando falta ou é inválido.
 */
export function prefixoDoCookie(valor: string | undefined = process.env.AUTH_COOKIE_PREFIX): string {
  return prefixoDeCookieValido(valor) ? valor!.trim() : PREFIXO_COOKIE_PADRAO;
}
