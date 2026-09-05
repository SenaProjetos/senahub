/**
 * Escopo da exclusão: "só esta revisão" ou "o documento inteiro" — parte PURA (sem Prisma).
 *
 * Existe porque a lixeira sempre trabalhou por LINHA (um `Upload` = um arquivo de uma
 * revisão). Limpar um documento com 3 revisões × 2 extensões exigia 6 exclusões manuais, e
 * passar uma deixava ponta solta: o recorte do link público escolhe a maior revisão ENTRE
 * OS SOBREVIVENTES, então a revisão velha esquecida sobe a "entrega corrente" e vai parar
 * na mão do cliente. Foi exatamente o que aconteceu no projeto 260032 (o `.dwg` R01 ficou
 * para trás quando R02 e R03 foram para a lixeira).
 *
 * A escolha passa a ser explícita no momento em que a intenção existe — quem exclui sabe se
 * está descartando uma revisão (e querendo a anterior de volta) ou limpando o documento. Com
 * isso a promoção da revisão anterior deixa de ser acidente e vira o que a pessoa pediu.
 *
 * O agrupamento segue o documento CANÔNICO (`substituidoPorId`), nunca o `documentoId` cru:
 * documentos fundidos por nome-base (M4) mantêm apelidos apontando para o canônico, e
 * agrupar pelo apelido deixaria as revisões do outro lado da fusão para trás — recriando a
 * ponta solta que este módulo existe para evitar.
 */

export type EscopoExclusao = "revisao" | "documento";

export type LinhaExclusao = {
  id: string;
  /** Documento lógico do upload. Nulo em linha legada/gerada por ferramenta. */
  documentoId: string | null;
  /** Documento que absorveu `documentoId` num merge (M4), quando houve. */
  documentoCanonicoId?: string | null;
};

/**
 * Chave de agrupamento. Documento canônico manda; sem documento nenhum, o upload é um
 * arquivo solto e forma um grupo de um — assim ele nunca é arrastado junto de outro nem
 * arrasta ninguém (não há linhagem de revisão para arrastar).
 */
export function chaveGrupo(linha: LinhaExclusao): string {
  const doc = linha.documentoCanonicoId ?? linha.documentoId;
  return doc ?? `solto:${linha.id}`;
}

/** Upload sem documento lógico não tem "documento inteiro" — a escolha não se aplica. */
export function temDocumento(linha: LinhaExclusao): boolean {
  return (linha.documentoCanonicoId ?? linha.documentoId) !== null;
}

export type GrupoDocumento<T extends LinhaExclusao> = {
  /** Chave canônica do grupo (documentoId canônico, ou `solto:<id>`). */
  chave: string;
  /** `null` quando o grupo é um arquivo solto (sem documento lógico). */
  documentoId: string | null;
  /** Linhas do grupo, na ordem em que entraram. */
  linhas: T[];
};

/**
 * Agrupa linhas por documento canônico, preservando a ordem de entrada (dentro do grupo e
 * entre grupos, pela primeira aparição) — quem ordena é quem consulta.
 */
export function agruparPorDocumento<T extends LinhaExclusao>(linhas: T[]): GrupoDocumento<T>[] {
  const grupos = new Map<string, GrupoDocumento<T>>();
  for (const linha of linhas) {
    const chave = chaveGrupo(linha);
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.linhas.push(linha);
    } else {
      grupos.set(chave, {
        chave,
        documentoId: temDocumento(linha) ? (linha.documentoCanonicoId ?? linha.documentoId) : null,
        linhas: [linha],
      });
    }
  }
  return [...grupos.values()];
}

/**
 * Ids finais da operação em lote: o que foi marcado, MAIS os irmãos vivos dos documentos que
 * a pessoa escolheu levar inteiros.
 *
 * `irmaosPorDocumento` é o que o servidor leu do banco (todas as revisões vivas de cada
 * documento canônico). Documento escolhido "inteiro" mas sem irmãos conhecidos degrada para
 * o que já estava selecionado — nunca para conjunto vazio, que apagaria a intenção.
 *
 * Devolve sem duplicata e em ordem estável (seleção primeiro, irmãos depois): a auditoria
 * registra a lista, e lista que muda de ordem a cada chamada é ruído no diff do histórico.
 */
export function expandirSelecao(
  selecionados: string[],
  documentosInteiros: string[],
  irmaosPorDocumento: Map<string, string[]>,
): string[] {
  const final: string[] = [];
  const vistos = new Set<string>();
  const empurrar = (id: string) => {
    if (vistos.has(id)) return;
    vistos.add(id);
    final.push(id);
  };

  for (const id of selecionados) empurrar(id);
  for (const documentoId of documentosInteiros) {
    for (const id of irmaosPorDocumento.get(documentoId) ?? []) empurrar(id);
  }
  return final;
}
