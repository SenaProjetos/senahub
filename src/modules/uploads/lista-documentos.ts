/**
 * Achatamento da árvore de arquivos em LINHAS de documento — puro, sem I/O.
 *
 * A árvore (`arvoreArquivosProjeto`) é agrupada por disciplina e separa pacote (A/B/OUTROS)
 * de pasta (`PastaProjeto`, tipos aprovação/laudo). A tabela densa da tela de Documentos
 * (Fase 1) precisa do contrário: uma lista plana e ordenável, com a disciplina como coluna.
 *
 * Fase 1 tem uma linha POR ARQUIVO — é o que o modelo de dados suporta hoje: `Upload` é a
 * unidade, e PDF/DWG de uma mesma prancha são registros independentes. Agrupar por documento
 * lógico multi-extensão depende do merge de chave da Fase 2 (D1, docs/auditoria/03-plano-
 * refatoracao.md), então NÃO é simulado aqui.
 */

import { extDe } from "@/modules/uploads/estrutura";

export type LinhaDocumento = {
  id: string;
  nome: string;
  /** Extensão minúscula sem ponto ("pdf"), "" quando o nome não tem extensão. */
  ext: string;
  disciplinaId: string;
  disciplinaNome: string;
  versao: number;
  /** Só arquivos de pacote têm validação por-arquivo; os de `PastaProjeto` não (null). */
  validado: boolean | null;
  autor: string;
  /** ISO — data de validação quando houver, senão de criação (vem da query). */
  data: string;
  tamanho: number;
  downloadUrl: string;
  /**
   * Herdado de `Disciplina.podeEnviar` (responsável pela disciplina ou perfil global, E a
   * capability `arquivos:enviar`). Usado só para ESCONDER ações na UI — o gate real continua
   * nas Server Actions. É conservador de propósito: renomear no servidor exige apenas
   * global-ou-responsável (sem a capability), então quem tem o direito de renomear mas não
   * o de enviar não vê o item no menu. Esconder demais é aceitável; mostrar demais não.
   */
  podeGerir: boolean;
};

/** Formato mínimo consumido daqui — subconjunto de `ArvoreDisciplina`. */
export type DisciplinaComArquivos = {
  id: string;
  nome: string;
  podeEnviar: boolean;
  arquivos: {
    id: string;
    nome: string;
    versao: number;
    tamanho: number;
    aprovado: boolean;
    autor: string;
    data: string;
    downloadUrl: string;
  }[];
  arquivosPasta: {
    id: string;
    nome: string;
    versao: number;
    tamanho: number;
    autor: string;
    data: string;
    downloadUrl: string;
  }[];
};

export const CAMPOS_ORDENACAO = ["nome", "disciplina", "versao", "data", "tamanho"] as const;
export type CampoOrdenacao = (typeof CAMPOS_ORDENACAO)[number];
export type Direcao = "asc" | "desc";

/** Achata a árvore em linhas. Preserva a ordem de disciplina/arquivo que veio da query. */
export function linhasDeDocumentos(disciplinas: DisciplinaComArquivos[]): LinhaDocumento[] {
  const linhas: LinhaDocumento[] = [];
  for (const d of disciplinas) {
    for (const a of d.arquivos) {
      linhas.push({
        id: a.id,
        nome: a.nome,
        ext: extDe(a.nome),
        disciplinaId: d.id,
        disciplinaNome: d.nome,
        versao: a.versao,
        validado: a.aprovado,
        autor: a.autor,
        data: a.data,
        tamanho: a.tamanho,
        downloadUrl: a.downloadUrl,
        podeGerir: d.podeEnviar,
      });
    }
    for (const a of d.arquivosPasta) {
      linhas.push({
        id: a.id,
        nome: a.nome,
        ext: extDe(a.nome),
        disciplinaId: d.id,
        disciplinaNome: d.nome,
        versao: a.versao,
        validado: null,
        autor: a.autor,
        data: a.data,
        tamanho: a.tamanho,
        downloadUrl: a.downloadUrl,
        podeGerir: d.podeEnviar,
      });
    }
  }
  return linhas;
}

/**
 * Ordena as linhas por um dos `CAMPOS_ORDENACAO`. Não muta a entrada.
 * Texto usa `localeCompare` pt-BR (acento/caixa), números e datas comparam direto.
 */
export function ordenarLinhas(
  linhas: LinhaDocumento[],
  campo: CampoOrdenacao,
  dir: Direcao,
): LinhaDocumento[] {
  const sinal = dir === "desc" ? -1 : 1;
  return [...linhas].sort((a, b) => {
    let cmp: number;
    switch (campo) {
      case "nome":
        cmp = a.nome.localeCompare(b.nome, "pt-BR");
        break;
      case "disciplina":
        // Empate de disciplina cai no nome, senão a ordem entre arquivos da mesma
        // disciplina fica indefinida (instável na percepção do usuário).
        cmp = a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR");
        break;
      case "versao":
        cmp = a.versao - b.versao;
        break;
      case "tamanho":
        cmp = a.tamanho - b.tamanho;
        break;
      case "data":
        cmp = a.data.localeCompare(b.data);
        break;
    }
    return cmp * sinal;
  });
}

/** Aceita só campos da whitelist (o valor vem da URL) — senão cai no padrão. */
export function campoOrdenacaoValido(valor: string | null | undefined): CampoOrdenacao | null {
  return (CAMPOS_ORDENACAO as readonly string[]).includes(valor ?? "") ? (valor as CampoOrdenacao) : null;
}

export const PERIODOS = ["7", "30", "90"] as const;
export type Periodo = (typeof PERIODOS)[number];

export type FiltrosDocumentos = {
  /** Texto livre: casa com nome do arquivo, disciplina ou responsável. */
  q?: string;
  ext?: string;
  autor?: string;
  /** Dias para trás a partir de `agora`. */
  periodo?: string;
  /** "sim" = só validados, "nao" = só pendentes. Arquivos de pasta não têm validação. */
  validado?: string;
};

/** Normaliza para busca: minúsculas e sem acento (a busca não deve exigir acento certo). */
function normalizarTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Aplica os filtros da tela sobre as linhas já carregadas. Puro: `agora` é injetado para o
 * filtro de período ser testável sem depender do relógio.
 *
 * Fase 1 filtra só o que os dados de hoje têm. Código de documento, título, descrição,
 * tags, fase e status documental (itens 6 e 7 da spec) não existem em `Upload` — chegam com
 * o modelo de Documento da Fase 2 e por isso NÃO são simulados aqui.
 */
export function filtrarLinhas(
  linhas: LinhaDocumento[],
  filtros: FiltrosDocumentos,
  agora: Date = new Date(),
): LinhaDocumento[] {
  const termo = filtros.q ? normalizarTexto(filtros.q.trim()) : "";
  const ext = filtros.ext?.toLowerCase() ?? "";
  const autor = filtros.autor ?? "";
  const dias = (PERIODOS as readonly string[]).includes(filtros.periodo ?? "")
    ? Number(filtros.periodo)
    : null;
  const limite = dias !== null ? new Date(agora.getTime() - dias * 86_400_000).toISOString() : null;

  return linhas.filter((l) => {
    if (termo) {
      const alvo = normalizarTexto(`${l.nome} ${l.disciplinaNome} ${l.autor}`);
      if (!alvo.includes(termo)) return false;
    }
    if (ext && l.ext !== ext) return false;
    if (autor && l.autor !== autor) return false;
    if (limite && l.data < limite) return false;
    if (filtros.validado === "sim" && l.validado !== true) return false;
    if (filtros.validado === "nao" && l.validado !== false) return false;
    return true;
  });
}

/** Quantos filtros estão ativos — alimenta o contador do botão "Filtros". */
export function contarFiltros(filtros: FiltrosDocumentos): number {
  return [filtros.q, filtros.ext, filtros.autor, filtros.periodo, filtros.validado].filter(
    (v) => typeof v === "string" && v.trim() !== "",
  ).length;
}
