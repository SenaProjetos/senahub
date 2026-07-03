/**
 * Limites de upload compartilhados entre cliente e servidor (client-safe — sem `server-only`,
 * mesmo padrão de `documentos/fontes-meta.ts`). O servidor re-exporta em `service.ts`.
 */
export const TAMANHO_MAX = 500 * 1024 * 1024; // 500 MB por arquivo

/** Rótulo humano do limite, para mensagens de erro. */
export const TAMANHO_MAX_LABEL = "500 MB";
