/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {}

/**
 * Classifica um erro lançado por uma action para fins de auditoria:
 * rejeição de regra de negócio (`ActionError`) vs. falha de sistema.
 */
export function resultadoDoErro(err: unknown): "falha" | "rejeitado" {
  return err instanceof ActionError ? "rejeitado" : "falha";
}
