/**
 * Estrutura de pastas por tipo de projeto — FONTE ÚNICA, pura e client-safe (sem
 * `server-only`/React). Usada pela seed de disciplina (server, `actions.ts`) e pela UI
 * (explorer/uploader) para saber quais pastas-template cada tipo cria por disciplina.
 *
 * Projetos `aprovacao`/`laudo` usam esta árvore no lugar de "Pranchas e arquivos" (pacote A)
 * e NÃO têm "Backup do modelo" (pacote B) nem validação por-arquivo. Os demais tipos
 * (`particular`/`licitacao`) seguem a árvore legada de `PacoteUpload` + extensão.
 */

export type PastaTemplate = {
  nome: string;
  filhos?: PastaTemplate[];
};

/** Árvore-template por tipo de projeto. A raiz substitui "Pranchas e arquivos". */
export const ESTRUTURA_POR_TIPO: Record<string, PastaTemplate[]> = {
  aprovacao: [
    {
      nome: "Aprovação",
      filhos: [{ nome: "Laudos" }, { nome: "Projetos" }, { nome: "Documentação" }],
    },
  ],
  laudo: [
    {
      nome: "Laudo",
      filhos: [
        { nome: "Fotos" },
        { nome: "Projetos" },
        { nome: "Anexos" },
        { nome: "Documentos" },
      ],
    },
  ],
};

/**
 * Tipos que usam a árvore-template (e, portanto, NÃO usam pacote A/B nem a validação
 * por-arquivo — a conclusão da disciplina vem do fluxo de aprovação de 2 passos).
 */
export function usaEstruturaCustom(tipo: string): boolean {
  return tipo in ESTRUTURA_POR_TIPO;
}

/**
 * Slug de UM segmento de caminho de pasta (filesystem-safe, minúsculo, sem acento).
 * Pura — reutilizada pela seed de template e pela criação de pasta personalizada, para
 * o `caminho` gravado em `PastaProjeto` bater com o caminho físico no storage.
 */
export function slugSegmento(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pasta"
  );
}

export type PastaTemplateFlat = {
  nome: string;
  /** Slug-path relativo à disciplina (ex.: "aprovacao/laudos"). */
  caminho: string;
  /** Caminho do pai (para religar a árvore ao semear); null = raiz da disciplina. */
  parentCaminho: string | null;
  ordem: number;
};

/**
 * Achata a árvore-template de um tipo em uma lista ordenada (pais antes dos filhos),
 * com o `caminho` slugado já computado — pronta para a seed criar as `PastaProjeto`
 * resolvendo `parentCaminho` → id na ordem. Tipos sem template retornam `[]`.
 */
export function achatarTemplate(tipo: string): PastaTemplateFlat[] {
  const arvore = ESTRUTURA_POR_TIPO[tipo];
  if (!arvore) return [];
  const out: PastaTemplateFlat[] = [];
  const walk = (nodes: PastaTemplate[], parentCaminho: string | null) => {
    nodes.forEach((n, i) => {
      const caminho = parentCaminho
        ? `${parentCaminho}/${slugSegmento(n.nome)}`
        : slugSegmento(n.nome);
      out.push({ nome: n.nome, caminho, parentCaminho, ordem: i });
      if (n.filhos?.length) walk(n.filhos, caminho);
    });
  };
  walk(arvore, null);
  return out;
}
