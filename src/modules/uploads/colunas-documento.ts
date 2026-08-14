/**
 * Colunas da tabela de documentos e quais delas o usuário vê (item 8 da spec).
 *
 * Puro, sem I/O: a preferência chega de fora (`UserPreference`) e sai daqui já resolvida.
 *
 * Guarda os OCULTOS, não os visíveis. Assim uma coluna nova nasce aparecendo para todo
 * mundo — se guardássemos os visíveis, quem já tem preferência salva nunca veria colunas
 * futuras sem mexer na configuração.
 */

export type ColunaDocumento = {
  id: string;
  label: string;
  /**
   * Não pode ser ocultada. Sem disciplina e nome o documento deixa de ser identificável, e
   * sem o menu a linha perde toda ação — esconder isso seria dar ao usuário uma tabela
   * inutilizável, não uma tabela enxuta.
   */
  essencial?: boolean;
  /**
   * Ordem de sacrifício em tela estreita (maior = cede primeiro). Vem do que a verificação
   * em 1366px mostrou: tamanho e data são os primeiros a estorvar, e são os menos usados
   * para achar uma prancha.
   */
  prioridadeCorte: number;
};

/** Ordem aqui é a ordem das colunas na tabela. */
export const COLUNAS_DOCUMENTO: ColunaDocumento[] = [
  { id: "disciplina", label: "Disciplina", essencial: true, prioridadeCorte: 0 },
  { id: "documento", label: "Documento", essencial: true, prioridadeCorte: 0 },
  { id: "revisao", label: "Revisão", prioridadeCorte: 1 },
  { id: "validado", label: "Validado", prioridadeCorte: 3 },
  { id: "extensao", label: "Extensões", prioridadeCorte: 2 },
  { id: "responsavel", label: "Responsável", prioridadeCorte: 4 },
  { id: "data", label: "Atualizado", prioridadeCorte: 5 },
  { id: "tamanho", label: "Tamanho", prioridadeCorte: 6 },
];

export const CHAVE_PREF_COLUNAS = "documentos:colunas-ocultas";

/** Ids válidos que podem ser ocultados (essenciais nunca entram). */
export function idsOcultaveis(): string[] {
  return COLUNAS_DOCUMENTO.filter((c) => !c.essencial).map((c) => c.id);
}

/**
 * Resolve a preferência em um conjunto de colunas visíveis.
 *
 * Tolera lixo: a preferência vem de JSON no banco, então valor de tipo errado ou id que não
 * existe mais (coluna removida numa versão futura) é ignorado em vez de quebrar a tela.
 * Essencial marcada como oculta também é ignorada — a regra do código vence a preferência.
 */
export function resolverColunasVisiveis(preferencia: unknown): Set<string> {
  const ocultaveis = new Set(idsOcultaveis());
  const ocultas = new Set<string>();
  if (Array.isArray(preferencia)) {
    for (const item of preferencia) {
      if (typeof item === "string" && ocultaveis.has(item)) ocultas.add(item);
    }
  }
  return new Set(COLUNAS_DOCUMENTO.filter((c) => !ocultas.has(c.id)).map((c) => c.id));
}

/**
 * Sugestão de colunas para uma largura de viewport — usada só como ponto de partida do
 * seletor ("Ajustar para esta tela"), nunca aplicada sozinha: esconder coluna sem o usuário
 * pedir é pior do que deixá-lo rolar a tabela.
 *
 * Os limiares saem da verificação real da Fase 1: em 1440px a tabela cabe inteira; em 1366px
 * as três últimas ficam atrás do scroll interno.
 */
export function sugerirOcultasPara(largura: number): string[] {
  if (largura >= 1440) return [];
  const corte = largura >= 1280 ? 5 : largura >= 1024 ? 3 : 2;
  return COLUNAS_DOCUMENTO.filter((c) => !c.essencial && c.prioridadeCorte >= corte).map((c) => c.id);
}
