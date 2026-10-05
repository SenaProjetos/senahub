import { ActionError } from "@/lib/action-error";
import { CAMPOS } from "@/lib/campos";
import { exigirCamposValidos } from "@/lib/campos/exigir";
import { CAMPOS_AUTOEDITAVEIS_SET, FORMATO_CAMPO, LABEL_CAMPO } from "./whitelist";

/** Colunas de `User` que a regra de formato compara (D4): o `select` de quem chama. */
export const SELECT_FORMATADOS = Object.fromEntries(Object.keys(FORMATO_CAMPO).map((k) => [k, true])) as Record<
  keyof typeof FORMATO_CAMPO,
  true
>;

/**
 * Proposta de alteração do próprio cadastro, pronta para guardar ou aplicar: só os campos da
 * whitelist, aparados, e os de formato conhecido validados e no formato padrão. O inválido que
 * já estava gravado passa como está (D4); o inválido novo é recusado com a frase do campo.
 * `comRotulo`: a frase leva o nome do campo na frente (aprovação do RH, que não tem o campo na tela).
 */
export function prepararAlteracoes(
  alteracoes: Record<string, string>,
  gravado: Record<string, unknown> | null | undefined,
  { comRotulo = false }: { comRotulo?: boolean } = {},
): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(alteracoes)) {
    if (CAMPOS_AUTOEDITAVEIS_SET.has(k) && typeof v === "string") r[k] = v.trim();
  }
  try {
    exigirCamposValidos(r, gravado, FORMATO_CAMPO);
  } catch (e) {
    if (!comRotulo || !(e instanceof ActionError) || !e.campos) throw e;
    const [campo, msg] = Object.entries(e.campos)[0];
    throw new ActionError(`${LABEL_CAMPO[campo] ?? campo}: ${msg}`, e.campos);
  }
  for (const [k, nome] of Object.entries(FORMATO_CAMPO)) {
    if (r[k]) r[k] = CAMPOS[nome].normalizar(r[k]);
  }
  return r;
}
