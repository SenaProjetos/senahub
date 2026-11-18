/**
 * Quem pode decidir (aprovar, rejeitar, lançar já aprovado, responder alteração) uma ausência ou
 * férias de outra pessoa (puro, client-safe). Uma regra só para abono e férias.
 *
 * Decisão do dono (2026-11-16): ausência e férias de quem é do RH precisam de um ADMINISTRADOR
 * (superusuário). Um colega de RH não decide a do outro, e ninguém decide a própria. O
 * superusuário decide qualquer uma, inclusive a própria — mesma regra da alçada do Financeiro.
 *
 * "É do RH" = tem `rh:gerir` (a audiência `rh_gestao`); quem chama resolve isso no servidor.
 */
export type BloqueioDeDecisao = "propria" | "de_rh";

export function bloqueioDeDecisao(
  dono: { id: string; ehRh: boolean },
  quem: { id: string; superUsuario: boolean },
): BloqueioDeDecisao | null {
  if (quem.superUsuario) return null;
  if (dono.id === quem.id) return "propria";
  if (dono.ehRh) return "de_rh";
  return null;
}

export const MOTIVO_ATESTADO_SO_RH = "Atestado anexado: só o RH abre.";
export const MOTIVO_ATESTADO_SO_ADMINISTRADOR = "Atestado anexado: só um administrador abre.";

type QuemVe = { id: string; superUsuario: boolean; gereRh: boolean };

/**
 * Por que `quem` NÃO abre o atestado de uma ausência deste dono (`null` = abre). Atestado é dado
 * de saúde (LGPD): abre o dono, ou quem pode decidir a ausência dele — o RH, e para quem é do RH
 * só um administrador (decisão do dono, 2026-11-17). `gereRh` vem da sessão (`rh:gerir`); o
 * superusuário passa sempre. A frase é a que a tela mostra no lugar de Ver/Baixar.
 */
export function motivoParaNaoVerAtestado(dono: { id: string; ehRh: boolean }, quem: QuemVe): string | null {
  if (dono.id === quem.id || quem.superUsuario) return null;
  if (!quem.gereRh) return MOTIVO_ATESTADO_SO_RH;
  return bloqueioDeDecisao(dono, quem) === null ? null : MOTIVO_ATESTADO_SO_ADMINISTRADOR;
}

export function podeVerAtestado(dono: { id: string; ehRh: boolean }, quem: QuemVe): boolean {
  return motivoParaNaoVerAtestado(dono, quem) === null;
}
