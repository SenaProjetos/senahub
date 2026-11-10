/**
 * Tipos da biblioteca de normas — **puro**. Cada valor de norma carregado na calculadora vive dentro de uma
 * `TabelaNorma`, que guarda a norma, a edição, o número da tabela, o item, a página do PDF de onde foi lido e a
 * vigência. A tela lê só `linhas`; o relatório lê também a fonte.
 *
 * Regra (spec §8 e decisão do dono): valores LITERAIS dos PDFs, todos "a conferir" até a validação de um
 * engenheiro. Valor que destoa da sequência fica como está, com a nota em `destoantes`.
 */

/** Como a edição está: vigente; "a confirmar" (aviso de edição na tela); vigência futura (aviso de data). */
export type SituacaoEdicao = "vigente" | "a_confirmar" | "futura" | "cancelada_estrutura";

export type FonteNorma = {
  /** Chave estável (nunca renomear: vai no relatório e nos testes). */
  id: string;
  /** Sigla como a norma se identifica (ex.: "DIS-NOR-053"). */
  documento: string;
  /** Emissor (ABNT, Neoenergia, Equatorial…). */
  emissor: string;
  titulo: string;
  /** Edição/revisão como escrita na norma (ex.: "Rev. 06"). */
  edicao: string;
  /** Edição curta para o aviso de edição da tela ("2004", "Rev. 06"): "…usa a {documento}, edição {edicaoCurta}." */
  edicaoCurta: string;
  /** Data da edição como escrita (ex.: "09/09/2025"). `null` = não identificada. */
  data: string | null;
  situacao: SituacaoEdicao;
  /** Só para `futura`: data a partir da qual vale, como a tela mostra. */
  valeAPartirDe?: string;
  /** Nome do arquivo lido (pasta docs/calculadora-eletrica/normas-e-catalogos, fora do git). */
  arquivo: string;
};

export type TabelaNorma<L> = {
  fonte: FonteNorma;
  /** "Tabela 36", "Quadro 35"… */
  numero: string;
  titulo: string;
  /** Item/seção da norma onde a tabela está. */
  item: string;
  /** Página física do PDF (1-based); `null` em fonte só em imagem sem paginação. */
  pagina: number | null;
  linhas: readonly L[];
  notas?: readonly string[];
  /** Condições de referência impressas no cabeçalho da tabela (isolação, temperaturas), literais do PDF. */
  condicoesDeReferencia?: Readonly<Record<string, string | number>>;
  /** Células que destoam das demais normas ou da sequência, mantidas literais (spec §11). */
  destoantes?: readonly string[];
  /** Situação do conteúdo: sempre "a conferir" até a validação (spec §2). */
  conferencia: "a_conferir";
};

/** Trecho literal de uma norma (regra em texto, limite de atendimento, vigência), para aviso e relatório. */
export type TrechoNorma = {
  fonte: FonteNorma;
  item: string;
  /** Página física do PDF (1-based); `null` em fonte sem paginação. */
  pagina: number | null;
  texto: string;
  /** Observação da extração (ex.: trecho tachado na imagem). */
  observacao?: string;
};

/** Referência curta para o relatório: "DIS-NOR-053 Rev. 06, Quadro 35". */
export function referenciaDe(t: Pick<TabelaNorma<unknown>, "fonte" | "numero">): string {
  return `${t.fonte.documento} ${t.fonte.edicao}, ${t.numero}`;
}
