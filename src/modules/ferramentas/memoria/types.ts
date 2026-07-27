/**
 * Modelo normalizado e puro de "memória de cálculo".
 * Sem I/O, sem Next — base única de onde partem os renderers (HTML/PDF, docx, xlsx).
 * Client-safe.
 */

/** Uma grandeza apresentada na memória (símbolo, fórmula, substituição e resultado). */
export type MemoriaValor = {
  /** Símbolo (ex.: "A", "I_x", "W_x"). */
  simbolo?: string;
  descricao: string;
  /** Valor já formatado (string) ou número (renderer formata). */
  valor: string | number;
  unidade?: string;
  /** Fórmula simbólica (ex.: "b·h³/12"). */
  formula?: string;
  /** Substituição numérica (ex.: "20·50³/12"). */
  substituicao?: string;
};

export type MemoriaTabela = {
  titulo?: string;
  colunas: string[];
  linhas: (string | number)[][];
};

/** Um gráfico/desenho embutido na memória (SVG inline; usado no HTML/PDF). */
export type MemoriaImagem = {
  titulo?: string;
  /**
   * Markup `<svg>…</svg>` autocontido. NÃO é escapado pelo renderer — só passar SVG
   * gerado pelos builders internos (`memoria/diagramas/`), nunca string vinda do usuário.
   */
  svg: string;
};

export type MemoriaSecao = {
  titulo: string;
  paragrafos?: string[];
  valores?: MemoriaValor[];
  tabelas?: MemoriaTabela[];
  /** Diagramas da seção. Renderizados no HTML/PDF; ignorados em docx/xlsx. */
  imagens?: MemoriaImagem[];
  notas?: string[];
};

export type MemoriaDoc = {
  /** Chave da ferramenta (ex.: "propriedades-secao"). */
  ferramenta: string;
  /** Título dado pelo usuário ao cálculo. */
  titulo: string;
  /** Nome da ferramenta (ex.: "Propriedades geométricas de seção"). */
  subtitulo?: string;
  norma?: string;
  /** ISO 8601. */
  geradoEm: string;
  autor?: string;
  /** Código/nome do projeto associado, se houver. */
  projeto?: string;
  secoes: MemoriaSecao[];
  /** Aviso de responsabilidade técnica (ART/RRT). */
  disclaimer: string;
};
