/**
 * Regras de recorte do link público de arquivos — parte PURA (sem Prisma, sem I/O).
 *
 * O que o cliente recebe por um link de disciplina é a entrega corrente, e só ela:
 *  - nada de lixeira (`excluidoEm`, filtrado na consulta);
 *  - nada de revisão anterior — de cada documento sai só a última;
 *  - nada de "backup do modelo" (pacote B), que é arquivo de software (RVT/NWD/TQS),
 *    não entrega.
 *
 * Fica separado das consultas porque as MESMAS regras valem em quatro lugares —
 * página, download de um arquivo, download de ART e .zip. Quando o recorte mora numa
 * consulta só, a página mostra R03 enquanto o .zip despacha R01+R02+R03 e as URLs
 * antigas continuam servindo revisão vencida.
 *
 * O escopo `selecao` NÃO passa por aqui de propósito: ali os arquivos foram escolhidos
 * a dedo por alguém de dentro, e essa escolha vence as regras (a lixeira continua fora
 * — arquivo na lixeira é purgado em 30 dias e viraria link quebrado).
 */

export type UploadParaLink = {
  id: string;
  /** Documento lógico que agrupa as revisões. Nulo em linha legada ou gerada por ferramenta. */
  documentoId: string | null;
  /**
   * Documento que absorveu `documentoId` num merge (M4). Quando existe, é ele que
   * agrupa: senão cada apelido calcularia a "sua" última revisão e o cliente veria
   * duas gerações do mesmo desenho.
   */
  documentoCanonicoId?: string | null;
  /** Número da revisão (R01 = 1). Nulo quando o upload não foi para nenhuma revisão. */
  revisaoNumero: number | null;
  /** Pacote legado; "B" = backup do modelo. Nulo quando o arquivo vive numa PastaProjeto. */
  pacote: string | null;
};

/** Backup do modelo (pacote B): arquivo de software, nunca entrega ao cliente. */
export function ehBackupDoModelo(u: { pacote: string | null }): boolean {
  return u.pacote === "B";
}

/** Documento pelo qual o upload agrupa suas revisões — o canônico manda. */
function chaveDocumento(u: UploadParaLink): string | null {
  return u.documentoCanonicoId ?? u.documentoId;
}

/**
 * De cada documento, mantém só os arquivos da revisão mais alta — todos eles, porque
 * uma revisão pode ter vários arquivos (na base de produção, 213 têm).
 *
 * Upload sem documento e upload sem revisão ficam. É deliberado: `documentoId` e
 * `revisaoId` são nulos em linha legada e em arquivo gerado por ferramenta, e sumir com
 * um arquivo do cliente sem qualquer sinal é pior do que deixar visível um arquivo
 * solto a mais. A ordem da entrada é preservada — quem ordena é a consulta.
 */
export function somenteUltimaRevisao<T extends UploadParaLink>(uploads: T[]): T[] {
  const maiorRevisao = new Map<string, number>();
  for (const u of uploads) {
    const doc = chaveDocumento(u);
    if (doc === null || u.revisaoNumero === null) continue;
    const atual = maiorRevisao.get(doc);
    if (atual === undefined || u.revisaoNumero > atual) maiorRevisao.set(doc, u.revisaoNumero);
  }

  return uploads.filter((u) => {
    const doc = chaveDocumento(u);
    if (doc === null || u.revisaoNumero === null) return true;
    return u.revisaoNumero === maiorRevisao.get(doc);
  });
}

/** Recorte completo de um link por disciplina: sem backup do modelo, só a última revisão. */
export function recortarParaLinkPublico<T extends UploadParaLink>(uploads: T[]): T[] {
  return somenteUltimaRevisao(uploads.filter((u) => !ehBackupDoModelo(u)));
}
