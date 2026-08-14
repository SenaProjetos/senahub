/**
 * Chave de agrupamento do documento lógico (DocumentoDisciplina) — pura, sem I/O.
 *
 * É o que identifica "o mesmo arquivo em versões diferentes" dentro de uma disciplina.
 * NÃO é a identidade do documento (essa é o `id`, e é ela que Pendencia referencia):
 * renomear reescreve a chave sem desancorar nada.
 */

export type LocalDocumento = {
  /** Pacote legado (A|B|OUTROS|RECEBIDOS) ou null quando o arquivo vive numa PastaProjeto. */
  pacote: string | null;
  /** Pasta da árvore PastaProjeto, ou null quando é pacote legado. */
  pastaId: string | null;
  nomeArquivo: string;
};

/**
 * Nome sem a extensão final, em minúsculas.
 *
 * Minúsculas porque o deploy é Windows/NTFS, que é case-insensitive: `PLANTA.pdf` e
 * `planta.pdf` são o MESMO arquivo em disco, e tratá-los como documentos distintos criaria
 * dois pais para uma linhagem só (é a mesma raiz do risco de colisão registrado em
 * `docs/auditoria/01-arquitetura-atual.md` §8).
 *
 * Dotfile (`.env`) e nome sem ponto ficam inteiros — `lastIndexOf(".") > 0` evita comer o
 * nome todo quando o ponto é o primeiro caractere.
 */
export function baseSemExtensao(nomeArquivo: string): string {
  const i = nomeArquivo.lastIndexOf(".");
  const base = i > 0 ? nomeArquivo.slice(0, i) : nomeArquivo;
  return base.toLowerCase();
}

/**
 * `"A/est-for-001-r03"` (pacote) ou `"pasta:<pastaId>/est-for-001-r03"` (árvore de pastas).
 *
 * A extensão NÃO entra na chave: PDF e DWG da mesma prancha precisam cair no mesmo
 * documento lógico, que é o objetivo da Fase 2 (item 1 da spec). Até a migration
 * `20260814160000_merge_documentos_por_base` isso era `${local}/${nomeArquivo}`, com a
 * extensão dentro — e por isso cada extensão virava um documento separado.
 *
 * O fallback `"sem-local"` é defensivo: `pacote` XOR `pastaId` é convenção de código, não
 * constraint no banco. Sem ele a chave sairia vazia numa linha inesperada e o UNIQUE
 * `(disciplinaId, chave)` não protegeria contra duplicata.
 *
 * Quem muda esta função MUDA O AGRUPAMENTO de todo o acervo: exige script de merge para
 * reagrupar o que já existe, senão o upsert passa a criar pais novos ao lado dos antigos.
 */
export function chaveDocumento({ pacote, pastaId, nomeArquivo }: LocalDocumento): string {
  const local = pacote ?? (pastaId ? `pasta:${pastaId}` : "sem-local");
  return `${local}/${baseSemExtensao(nomeArquivo)}`;
}

/** Chave no formato ANTIGO (com extensão) — só o script de merge usa, para achar o que migrar. */
export function chaveDocumentoLegada({ pacote, pastaId, nomeArquivo }: LocalDocumento): string {
  const local = pacote ?? (pastaId ? `pasta:${pastaId}` : "sem-local");
  return `${local}/${nomeArquivo}`;
}
