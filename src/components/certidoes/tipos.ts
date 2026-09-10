/**
 * Tipos de UI compartilhados pela tela de Certidões.
 *
 * Ficam num arquivo próprio (e não dentro da tabela, como `LinhaAcesso` em /acessos) porque aqui
 * três componentes precisam da MESMA linha — tabela, drawer de detalhes e o orquestrador —, e
 * declarar no componente faria os outros dois importarem dele só pelo tipo.
 */

export type Versao = {
  id: string;
  numero: number;
  validade: string;
  arquivoNome: string | null;
  /** MIME gravado no upload — decide se dá para pré-visualizar. */
  mimeType: string | null;
  data: string;
  /** Nome de quem enviou (`CertidaoVersao.autorId` resolvido no servidor). */
  autor: string | null;
};

export type LicitacaoRef = {
  licitacaoId: string;
  titulo: string;
  status: string;
  exigencia: string;
  atendido: boolean;
};

export type Auditoria = {
  id: string;
  acao: string;
  resultado: string;
  usuario: string | null;
  data: string;
};

export type Certidao = {
  id: string;
  tipoId: string;
  tipo: string;
  /** Vem de `CertidaoTipo.obrigatoria` — não existe obrigatoriedade por certidão. */
  obrigatoria: boolean;
  descricao: string | null;
  validade: string;
  arquivoNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  versoes: Versao[];
  licitacoes: LicitacaoRef[];
  auditoria: Auditoria[];
};

export type CertidaoExcluida = {
  id: string;
  tipo: string;
  descricao: string | null;
  validade: string;
  excluidoEm: string;
  excluidoPor: string | null;
};

export type Tipo = { id: string; nome: string; obrigatoria: boolean };
export type Responsavel = { id: string; name: string };
export type LinkPublico = {
  id: string;
  token: string;
  ativo: boolean;
  expiraEm: string | null;
  certidaoIds: string[];
  createdAt: string;
};

/** Aba de recorte rápido (§17). Só "todas" e "excluidas" — o resto virou filtro nos cards (§3). */
export type Aba = "todas" | "excluidas";

/** Filtros combináveis (§9). `""` = sem restrição naquela dimensão. */
export type Filtros = {
  busca: string;
  situacao: "" | "vencida" | "vence_em_breve" | "ok";
  documento: "" | "com" | "sem";
  obrigatoriedade: "" | "obrigatorias" | "opcionais";
  responsavelId: string;
  tipoId: string;
};

export const FILTROS_VAZIOS: Filtros = {
  busca: "",
  situacao: "",
  documento: "",
  obrigatoriedade: "",
  responsavelId: "",
  tipoId: "",
};

/** Quantas dimensões estão restringindo a lista — vira o número no botão [Filtrar N] (§9). */
export function contarFiltrosAtivos(f: Filtros): number {
  return [f.busca, f.situacao, f.documento, f.obrigatoriedade, f.responsavelId, f.tipoId].filter(
    Boolean,
  ).length;
}

/** Ordenação escolhida pelo usuário (§8 — a padrão é a por prioridade). */
export type Ordem = "prioridade" | "validade_asc" | "validade_desc" | "nome";

export const ORDEM_LABEL: Record<Ordem, string> = {
  prioridade: "Prioridade",
  validade_asc: "Validade (mais próxima)",
  validade_desc: "Validade (mais distante)",
  nome: "Nome (A–Z)",
};
