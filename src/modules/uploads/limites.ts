/**
 * Limites de upload compartilhados entre cliente e servidor (client-safe — sem `server-only`,
 * mesmo padrão de `documentos/fontes-meta.ts`). O servidor re-exporta em `service.ts`.
 */
export const TAMANHO_MAX = 500 * 1024 * 1024; // 500 MB por arquivo (padrão: Pranchas/Recebidos)

/** Rótulo humano do limite padrão, para mensagens de erro. */
export const TAMANHO_MAX_LABEL = "500 MB";

// Backups (pacote B) são modelos grandes (RVT/NWD/backup do TQS…) — teto maior.
export const TAMANHO_MAX_BACKUP = 1536 * 1024 * 1024; // 1,5 GB por arquivo
export const TAMANHO_MAX_BACKUP_LABEL = "1,5 GB";

/** Limite de tamanho (bytes) conforme o pacote de destino. B (backup) = 1,5 GB; demais = 500 MB. */
export function limiteDoPacote(pacote: string): number {
  return pacote === "B" ? TAMANHO_MAX_BACKUP : TAMANHO_MAX;
}

/** Rótulo humano do limite conforme o pacote. */
export function limiteLabelDoPacote(pacote: string): string {
  return pacote === "B" ? TAMANHO_MAX_BACKUP_LABEL : TAMANHO_MAX_LABEL;
}
