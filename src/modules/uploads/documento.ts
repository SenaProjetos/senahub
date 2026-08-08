/**
 * Chave de agrupamento do documento lógico (DocumentoDisciplina) — pura, sem I/O.
 *
 * É o que identifica "o mesmo arquivo em versões diferentes" dentro de uma disciplina.
 * NÃO é a identidade do documento (essa é o `id`, e é ela que Pendencia referencia):
 * renomear reescreve a chave sem desancorar nada.
 *
 * Precisa casar EXATAMENTE com a expressão do backfill em
 * `prisma/migrations/20260806120000_documento_disciplina/migration.sql`:
 *   COALESCE(pacote::text, 'pasta:' || "pastaId", 'sem-local') || '/' || "nomeArquivo"
 * Divergir daqui faz o upsert criar um pai duplicado em vez de achar o existente.
 */

export type LocalDocumento = {
  /** Pacote legado (A|B|OUTROS|RECEBIDOS) ou null quando o arquivo vive numa PastaProjeto. */
  pacote: string | null;
  /** Pasta da árvore PastaProjeto, ou null quando é pacote legado. */
  pastaId: string | null;
  nomeArquivo: string;
};

/**
 * `"A/planta.pdf"` (pacote) ou `"pasta:<pastaId>/planta.pdf"` (árvore de pastas).
 *
 * O fallback `"sem-local"` é defensivo: `pacote` XOR `pastaId` é convenção de código, não
 * constraint no banco. Sem ele a chave sairia vazia numa linha inesperada e o UNIQUE
 * `(disciplinaId, chave)` não protegeria contra duplicata.
 */
export function chaveDocumento({ pacote, pastaId, nomeArquivo }: LocalDocumento): string {
  const local = pacote ?? (pastaId ? `pasta:${pastaId}` : "sem-local");
  return `${local}/${nomeArquivo}`;
}
