/**
 * Monta a árvore de `PastaProjeto` (template + custom) de uma disciplina a partir da
 * lista achatada vinda do banco, anexando os uploads que apontam pra cada pasta. Puro
 * e client-safe — reusado pelo explorer (`arquivos-explorer.tsx`) e pelo `DisciplinaCard`.
 */

export type PastaFlat = {
  id: string;
  parentId: string | null;
  nome: string;
  caminho: string;
  origem: string;
  ordem: number;
};

export type PastaArvoreNo<A> = {
  id: string;
  nome: string;
  caminho: string;
  origem: string;
  arquivos: A[];
  filhos: PastaArvoreNo<A>[];
};

/** Aninha `pastas` por `parentId`/`ordem` e anexa `arquivos` (por `pastaId`) em cada nó. */
export function montarArvorePastas<A>(
  pastas: PastaFlat[],
  arquivosPorPasta: Map<string, A[]>,
): PastaArvoreNo<A>[] {
  const porId = new Map<string, PastaArvoreNo<A>>(
    pastas.map((p) => [
      p.id,
      {
        id: p.id,
        nome: p.nome,
        caminho: p.caminho,
        origem: p.origem,
        arquivos: arquivosPorPasta.get(p.id) ?? [],
        filhos: [],
      },
    ]),
  );
  const raizes: PastaArvoreNo<A>[] = [];
  const ordenados = [...pastas].sort((a, b) => a.ordem - b.ordem);
  for (const p of ordenados) {
    const no = porId.get(p.id)!;
    if (p.parentId) {
      const pai = porId.get(p.parentId);
      if (pai) pai.filhos.push(no);
      else raizes.push(no); // pai fora da lista (não deveria acontecer) — trata como raiz
    } else {
      raizes.push(no);
    }
  }
  return raizes;
}

/** Achata a árvore de volta numa lista com profundidade — para selects indentados (upload/mover). */
export function listarComProfundidade<A>(
  arvore: PastaArvoreNo<A>[],
  profundidade = 0,
): { id: string; nome: string; profundidade: number }[] {
  const out: { id: string; nome: string; profundidade: number }[] = [];
  for (const no of arvore) {
    out.push({ id: no.id, nome: no.nome, profundidade });
    out.push(...listarComProfundidade(no.filhos, profundidade + 1));
  }
  return out;
}
