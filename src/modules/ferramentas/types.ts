/**
 * Tipos compartilhados do módulo ferramentas.
 * Sem dependências de servidor — seguro para importar em client components.
 */

export type Disciplina =
  | "Universal"
  | "Estrutural"
  | "Fundações"
  | "Hidrossanitário"
  | "Elétrico"
  | "Incêndio (PPCI)"
  | "Climatização (AVAC)";

export type TipoFerramenta = "rapida" | "completa";

export type FormatoExport = "pdf" | "docx" | "xlsx" | "dxf";

/** Resultado base retornado por todos os engines de cálculo. */
export type ResultadoBase = {
  /** Campos exibidos no painel de resultado (chave → valor formatado). */
  campos: Record<string, string | number>;
  /** Alertas ou notas contextuais (ex.: "Seção não atende — revisar"). */
  alertas?: string[];
};

/** Snapshot de cálculo salvo no banco (entradasJson + resultadoJson). */
export type SnapshotCalculo = {
  ferramenta: string;
  titulo: string;
  norma?: string;
  versaoCalc: number;
  entradasJson: Record<string, unknown>;
  resultadoJson: ResultadoBase;
};

/** Item da lista de recentes por ferramenta. */
export type RecenteCalculo = {
  id: string;
  titulo: string;
  ferramenta: string;
  projetoId: string | null;
  disciplinaId: string | null;
  createdAt: Date;
};
