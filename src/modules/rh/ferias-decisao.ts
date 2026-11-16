/**
 * Quem pode decidir ou lançar férias (puro, client-safe). Mesma regra do abono
 * (`abono-entrada.ts`): ninguém decide nem lança as próprias férias — exceto o superusuário na
 * decisão, para o escritório com uma pessoa só no RH não ficar sem quem aprove.
 */

/** Mesma frase na action e no toast: dois cliques (ou duas abas) decidindo as mesmas férias. */
export const MOTIVO_FERIAS_JA_DECIDIDAS = "Estas férias já foram decididas. Atualize a página.";
/** Mesma frase na action e na fila do RH (no lugar dos botões). */
export const MOTIVO_PROPRIAS_FERIAS = "São as suas próprias férias: outra pessoa do RH decide.";

/** Por que `quem` NÃO pode aprovar/rejeitar esta solicitação de férias (`null` = pode). */
export function motivoParaNaoDecidirFerias(
  ferias: { status: string; userId: string },
  quem: { id: string; superUsuario: boolean },
): string | null {
  if (ferias.status !== "pendente") return MOTIVO_FERIAS_JA_DECIDIDAS;
  if (ferias.userId === quem.id && !quem.superUsuario) return MOTIVO_PROPRIAS_FERIAS;
  return null;
}

/**
 * Por que o RH NÃO pode lançar férias (já aprovadas) para `alvoId` (`null` = pode). As próprias
 * férias passam pela solicitação; senão o lançamento direto contornaria a regra acima.
 */
export function motivoParaNaoLancarFeriasPara(alvoId: string, autorId: string): string | null {
  if (alvoId === autorId) {
    return "Para as suas próprias férias, use a solicitação em RH: outra pessoa do RH aprova.";
  }
  return null;
}
