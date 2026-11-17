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
