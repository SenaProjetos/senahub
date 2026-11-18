/**
 * Modelo do relatório do estudo de cargas e demanda — **puro**. É o documento NEUTRO de onde saem o PDF (pelo renderizador
 * existente da memória, via `paraMemoriaDoc`), o Word e o Excel (renderizadores próprios, formato compacto). Sem I/O, sem Next.
 *
 * Números ficam como números (`{ n, c }`: valor e casas) para o Excel gravar célula numérica e o Word/PDF escreverem com
 * vírgula; `null` vira "—". Texto é texto.
 */

export type Num = { n: number | null; c: number };
export type Celula = string | Num;

export const num = (n: number | null | undefined, c = 2): Num => ({ n: n == null || !Number.isFinite(n) ? null : n, c });
export const ehNum = (x: Celula): x is Num => typeof x === "object" && x !== null;

export type TabelaRel = {
  titulo?: string;
  colunas: string[];
  linhas: Celula[][];
  /** Última linha é total (negrito, fundo cinza). */
  ultimaEhTotal?: boolean;
  /** Primeira coluna alinhada à esquerda (texto livre); as demais centralizadas. Padrão: sim. */
  primeiraColunaTexto?: boolean;
};

export type BlocoRel =
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "texto"; texto: string; negrito?: boolean }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "tabela"; tabela: TabelaRel };

/** Aba do Excel em que a seção cai (uma aba por etapa: spec §7). */
export type AbaExcel = "Resumo" | "Levantamento" | "Demandas" | "Centros e entradas" | "Fontes";

export type SecaoRel = {
  numero: number;
  titulo: string;
  aba: AbaExcel;
  blocos: BlocoRel[];
};

export type RelatorioCargas = {
  titulo: string;
  subtitulo: string;
  /** AAAA-MM-DD (dia de São Paulo). */
  emissao: string;
  /** Nome do estudo e do projeto, para o nome do arquivo e o cabeçalho. */
  nomeEstudo: string;
  obra: string;
  secoes: SecaoRel[];
  /** Marca "Dados não conferidos por responsável técnico" (sem declaração ou sem CREA). */
  naoConferido: boolean;
};

/** Metadados que não estão no documento do estudo. */
export type MetaRelatorio = {
  nomeEstudo: string;
  /** "260031 — Edifício X". */
  obra: string;
  cliente: string;
  local?: string;
  /** AAAA-MM-DD da emissão (hoje, em São Paulo). */
  emissao: string;
};

export const ABAS_EXCEL: readonly AbaExcel[] = ["Resumo", "Levantamento", "Demandas", "Centros e entradas", "Fontes"];
