/**
 * Permissões que só valem para quem é de DENTRO (`User.tipo = interno`). Puro, sem I/O.
 *
 * O Financeiro da empresa é só de interno (decisão do dono, 2026-11-19): o cliente do portal (externo) alcança
 * apenas `financeiro:extrato`, que no portal mostra as parcelas DELE. Qualquer outra ação do recurso `financeiro`
 * é negada a externo pelo motor (`permissaoEfetiva`/`permissoesEfetivas`) mesmo que o perfil, um override ou o
 * superusuário a conceda — assim páginas, Server Actions, rotas de API e menu caem juntos, sem depender de cada
 * página lembrar da trava.
 */

/** Ações do recurso `financeiro` que um externo pode ter. */
const ACOES_DO_FINANCEIRO_PARA_EXTERNO: ReadonlySet<string> = new Set(["extrato"]);

/** `recurso:acao` exige pessoa interna? */
export function soParaInterno(recurso: string, acao: string): boolean {
  return recurso === "financeiro" && !ACOES_DO_FINANCEIRO_PARA_EXTERNO.has(acao);
}

/** Mesma regra sobre a chave `"recurso:acao"` (lista do menu). */
export function chaveSoParaInterno(chave: string): boolean {
  const i = chave.indexOf(":");
  return i > 0 && soParaInterno(chave.slice(0, i), chave.slice(i + 1));
}
