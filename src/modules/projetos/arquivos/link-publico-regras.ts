/**
 * Regras de recorte do link público de arquivos — parte PURA (sem Prisma, sem I/O).
 *
 * O que o cliente recebe por um link de disciplina é a entrega corrente, e só ela:
 *  - nada de lixeira (`excluidoEm`, filtrado na consulta);
 *  - nada de revisão anterior — de cada documento sai só a última;
 *  - nada de "backup do modelo" (pacote B), que é arquivo de software (RVT/NWD/TQS),
 *    não entrega;
 *  - nada de documento com status FINAL (Obsoleto, Arquivado — reunião de 29/09/2026): ele
 *    foi aposentado, e o cliente não pode seguir baixando como se valesse.
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
  /** O documento (o canônico, num merge) está com status final — Obsoleto, Arquivado. */
  documentoFinal?: boolean;
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

/**
 * Recorte completo de um link por disciplina: sem backup do modelo, sem documento final, só a última
 * revisão. O final sai ANTES de escolher a revisão: documento aposentado não tem entrega corrente.
 */
export function recortarParaLinkPublico<T extends UploadParaLink>(uploads: T[]): T[] {
  return somenteUltimaRevisao(uploads.filter((u) => !ehBackupDoModelo(u) && !u.documentoFinal));
}

/**
 * Link com as pastas do cliente (`porSituacao`, reunião de 29/09/2026): em quais das duas pastas um upload
 * VALIDADO e fora da lixeira aparece. Não é "a última revisão": é a revisão que alguém marcou no documento
 * (`revisaoCompartilhadaId` / `revisaoLiberadaObraId`) — a equipe segue versionando e o cliente só vê a
 * próxima quando ela for marcada. Backup do modelo, documento final e apelido de merge não aparecem.
 *
 * É a MESMA regra na página, no download direto e no .zip — senão a URL de um arquivo desmarcado
 * continuaria abrindo.
 */
export type UploadParaSituacao = {
  revisaoId: string | null;
  pacote: string | null;
  documento: {
    substituidoPorId: string | null;
    final: boolean;
    revisaoCompartilhadaId: string | null;
    revisaoLiberadaObraId: string | null;
  } | null;
};

export function situacoesDoUpload(u: UploadParaSituacao): ("compartilhado" | "liberado_obra")[] {
  const d = u.documento;
  if (ehBackupDoModelo(u) || !d || d.substituidoPorId || d.final || !u.revisaoId) return [];
  const situacoes: ("compartilhado" | "liberado_obra")[] = [];
  if (u.revisaoId === d.revisaoCompartilhadaId) situacoes.push("compartilhado");
  if (u.revisaoId === d.revisaoLiberadaObraId) situacoes.push("liberado_obra");
  return situacoes;
}

/**
 * Filtro de fase do link (F4, D37b): "só o Executivo para o cliente", "só o Básico para a
 * prefeitura".
 *
 * ⚠ `faseIds` VAZIO = TODAS AS FASES — o contrário de `disciplinaIds`, onde vazio nega tudo.
 * É o valor que todo link anterior à F4 carrega, e ele não pode passar a servir menos.
 *
 * Com lista preenchida, arquivo SEM fase só passa com `incluirSemFase`: não dá para provar
 * que ele pertence à fase liberada, e o link da prefeitura não pode vazar um Executivo que
 * ninguém classificou.
 */
export type FiltroFases = {
  faseIds: readonly string[];
  incluirSemFase: boolean;
};

/** A fase de UM arquivo está liberada no link? É o teste do download direto. */
export function faseLiberada(faseId: string | null, filtro: FiltroFases): boolean {
  if (filtro.faseIds.length === 0) return true;
  if (faseId === null) return filtro.incluirSemFase;
  return filtro.faseIds.includes(faseId);
}

/**
 * Aplica o filtro de fase a uma lista.
 *
 * TEM DE RODAR DEPOIS de `recortarParaLinkPublico`, nunca antes. A fase mora no documento, e
 * num merge o apelido e o canônico podem ter fases diferentes. Filtrar antes tiraria a
 * revisão mais alta do grupo e o recorte promoveria uma revisão ANTIGA a "entrega corrente" —
 * o mesmo mecanismo do pino de comportamento de `recortarParaLinkPublico` (chamado real do
 * projeto 260032), só que disparado pelo filtro. Filtrando depois, a entrega corrente é
 * decidida primeiro e, se a fase dela não é liberada, o documento simplesmente sai do link.
 */
export function filtrarPorFases<T extends { faseId: string | null }>(itens: T[], filtro: FiltroFases): T[] {
  if (filtro.faseIds.length === 0) return itens;
  return itens.filter((i) => faseLiberada(i.faseId, filtro));
}
