/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {
  /** Mensagem por campo (chave do schema): volta em `fieldErrors` e aparece sob o campo. */
  readonly campos?: Record<string, string>;
  constructor(message: string, campos?: Record<string, string>) {
    super(message);
    this.campos = campos;
  }
}

/** `campos` de um `ActionError` no formato `fieldErrors` do Zod; `undefined` quando não há. */
export function fieldErrorsDoErro(err: unknown): Record<string, string[]> | undefined {
  if (!(err instanceof ActionError) || !err.campos) return undefined;
  const entradas = Object.entries(err.campos).map(([k, v]): [string, string[]] => [k, [v]]);
  return entradas.length ? Object.fromEntries(entradas) : undefined;
}

/**
 * Classifica um erro lançado por uma action para fins de auditoria:
 * rejeição de regra de negócio (`ActionError`) vs. falha de sistema.
 */
export function resultadoDoErro(err: unknown): "falha" | "rejeitado" {
  return err instanceof ActionError ? "rejeitado" : "falha";
}
