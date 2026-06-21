/**
 * Lógica pura de decisão de alerta do chat global (sem React/DOM/socket),
 * para ser testável diretamente. Decide se uma mensagem recebida deve
 * tocar som e/ou mostrar toast, dado o contexto do destinatário.
 */

export type ContextoAlerta = {
  /** A mensagem foi enviada pelo próprio usuário. */
  ehMinha: boolean;
  /** O usuário está com o chat aberto/visível (ChatView montado cuida do som). */
  chatAtivo: boolean;
  /** Preferência "som do chat" ligada. */
  somHabilitado: boolean;
  /** Status do próprio usuário é "reunião" (não perturbe). */
  emReuniao: boolean;
  /** O canal de origem foi silenciado pelo usuário. */
  canalSilenciado?: boolean;
};

export type DecisaoAlerta = {
  tocarSom: boolean;
  mostrarToast: boolean;
};

/**
 * Regras:
 * - Mensagem própria nunca alerta.
 * - Se o chat já está ativo, o ChatView cuida do feedback → provider silencia.
 * - Som só toca com preferência ligada e fora de reunião (não perturbe).
 * - Toast aparece sempre que for de outro autor e o chat não estiver ativo.
 * - Canal silenciado suprime som e toast (badge persiste).
 */
export function decidirAlerta(ctx: ContextoAlerta): DecisaoAlerta {
  if (ctx.ehMinha || ctx.chatAtivo) {
    return { tocarSom: false, mostrarToast: false };
  }
  if (ctx.canalSilenciado) {
    return { tocarSom: false, mostrarToast: false };
  }
  return {
    tocarSom: ctx.somHabilitado && !ctx.emReuniao,
    mostrarToast: true,
  };
}
