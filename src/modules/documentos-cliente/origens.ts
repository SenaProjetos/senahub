/**
 * Origens de `Documento` que as consultas EXCLUEM — puro. Toda consulta que filtra origem por exclusão usa
 * estas listas (o teste-guarda recusa literal): uma origem nova entra aqui uma vez, não em cada `where`.
 */
export const ORIGEM_MODELO_FEDERADO = "modelo_federado" as const;

/** Fora de "Recebidos do cliente" (e do portal e da árvore global, que leem a mesma regra). */
export const ORIGENS_FORA_DE_RECEBIDOS = ["interno", "base_arquitetonica", ORIGEM_MODELO_FEDERADO] as const;

/** Fora da lista de modelos da Compatibilização e dos DWGs recebidos: o federado carregaria a obra duas vezes. */
export const ORIGENS_FORA_DOS_MODELOS = ["interno", ORIGEM_MODELO_FEDERADO] as const;
