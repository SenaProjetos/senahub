/**
 * Regras do plano de contas (N6 do núcleo do Financeiro). Puras, sem I/O.
 *
 * A DRE agrupa pelo tipo da CATEGORIA e o DFC pelo tipo do LANÇAMENTO: se os dois divergem, o mesmo
 * dinheiro aparece como receita num relatório e despesa no outro. Por isso (1) o lançamento só aceita
 * categoria do mesmo tipo e (2) o tipo de uma categoria em uso não muda. Código e pai eram livres: pai
 * de outra natureza ou da própria descendência (ciclo) quebrava a árvore do plano.
 */

export type TipoCat = "receita" | "despesa";

export function motivoCategoriaIncompativel(tipoLancamento: TipoCat, tipoCategoria: TipoCat): string | null {
  if (tipoLancamento === tipoCategoria) return null;
  return tipoLancamento === "despesa"
    ? "Esta categoria é de receita: escolha uma categoria de despesa."
    : "Esta categoria é de despesa: escolha uma categoria de receita.";
}

export type CategoriaDaArvore = { id: string; paiId: string | null; tipo: TipoCat };

/** Ancestrais de `id` (do pai à raiz), para detectar ciclo; para ao repetir um id. */
export function ancestraisDe(id: string, porId: ReadonlyMap<string, CategoriaDaArvore>): string[] {
  const out: string[] = [];
  let atual = porId.get(id)?.paiId ?? null;
  while (atual && !out.includes(atual)) {
    out.push(atual);
    atual = porId.get(atual)?.paiId ?? null;
  }
  return out;
}

/**
 * Por que a edição/criação da categoria não pode acontecer; `null` = pode.
 * `id` ausente = categoria nova.
 */
export function motivoCategoriaInvalida(p: {
  id?: string;
  tipo: TipoCat;
  paiId: string | null;
  porId: ReadonlyMap<string, CategoriaDaArvore>;
  /** Tipo gravado hoje (edição). */
  tipoAtual?: TipoCat;
  /** Quantos lançamentos usam a categoria. */
  lancamentos?: number;
  /** Categoria do sistema (tem chave): outras partes do código dependem do tipo dela. */
  doSistema?: boolean;
}): string | null {
  if (p.id && p.tipoAtual && p.tipo !== p.tipoAtual) {
    if (p.doSistema) return "Categoria do sistema: o tipo não pode mudar, o sistema lança nela sozinho.";
    if ((p.lancamentos ?? 0) > 0) {
      return `Esta categoria já tem ${p.lancamentos} lançamento(s): mudar o tipo moveria o dinheiro entre receita e despesa nos relatórios. Crie outra categoria.`;
    }
  }
  if (p.paiId) {
    if (p.id && p.paiId === p.id) return "A categoria não pode ser pai dela mesma.";
    const pai = p.porId.get(p.paiId);
    if (!pai) return "Categoria pai não encontrada.";
    if (p.id && ancestraisDe(p.paiId, p.porId).includes(p.id)) return "Esse pai é uma subcategoria desta: a árvore ficaria em círculo.";
    if (pai.tipo !== p.tipo) return `O pai é de ${pai.tipo}: a subcategoria precisa ser do mesmo tipo.`;
  }
  return null;
}
