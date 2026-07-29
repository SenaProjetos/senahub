/**
 * Relatório de impacto da troca de data-base (= troca da `CustoBasePreco` do orçamento) — PURO.
 *
 * O caller resolve os custos dos DOIS lados (base atual e base nova) e passa aqui; este módulo só
 * compara e classifica. É pré-visualização: nada é gravado até o usuário confirmar.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type SituacaoItemTroca =
  /** Custo mudou e será atualizado. */
  | "alterado"
  /** Custo idêntico nas duas bases. */
  | "inalterado"
  /** Sem preço na base nova — custo atual é preservado (não se zera orçamento por falta de cotação). */
  | "sem_preco_na_nova"
  /** Item travado: imune ao recálculo, por decisão do usuário. */
  | "bloqueado_preservado";

export type ItemParaTroca = {
  id: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  /** Custo unitário atualmente materializado no item. */
  custoAtual: number;
  /** Custo unitário resolvido na base NOVA; null = sem cotação lá. */
  custoNovo: number | null;
  bloqueado: boolean;
};

export type LinhaImpacto = {
  id: string;
  codigo: string;
  descricao: string;
  custoAntes: number;
  /** Custo que ficará gravado após confirmar (igual ao atual quando preservado). */
  custoDepois: number;
  /** Variação percentual do custo unitário. 0 quando preservado. */
  variacaoPct: number;
  totalAntes: number;
  totalDepois: number;
  situacao: SituacaoItemTroca;
};

export type RelatorioImpacto = {
  linhas: LinhaImpacto[];
  totalAntes: number;
  totalDepois: number;
  variacaoPct: number;
  contagem: Record<SituacaoItemTroca, number>;
};

/** Variação percentual de `antes` → `depois`. De zero para não-zero é 100% (evita divisão por zero). */
export function variacaoPercentual(antes: number, depois: number): number {
  if (antes === depois) return 0;
  if (antes === 0) return 100;
  return round2(((depois - antes) / antes) * 100);
}

/** Compara o custo de cada item entre a base atual e a nova, sem gravar nada. */
export function relatorioImpacto(itens: ItemParaTroca[]): RelatorioImpacto {
  const contagem: Record<SituacaoItemTroca, number> = {
    alterado: 0,
    inalterado: 0,
    sem_preco_na_nova: 0,
    bloqueado_preservado: 0,
  };

  const linhas: LinhaImpacto[] = itens.map((item) => {
    let situacao: SituacaoItemTroca;
    let custoDepois: number;

    if (item.bloqueado) {
      situacao = "bloqueado_preservado";
      custoDepois = item.custoAtual;
    } else if (item.custoNovo === null) {
      situacao = "sem_preco_na_nova";
      custoDepois = item.custoAtual;
    } else if (item.custoNovo === item.custoAtual) {
      situacao = "inalterado";
      custoDepois = item.custoAtual;
    } else {
      situacao = "alterado";
      custoDepois = item.custoNovo;
    }
    contagem[situacao]++;

    return {
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      custoAntes: item.custoAtual,
      custoDepois,
      variacaoPct: variacaoPercentual(item.custoAtual, custoDepois),
      totalAntes: round2(item.custoAtual * item.quantidade),
      totalDepois: round2(custoDepois * item.quantidade),
      situacao,
    };
  });

  const totalAntes = round2(linhas.reduce((s, l) => s + l.totalAntes, 0));
  const totalDepois = round2(linhas.reduce((s, l) => s + l.totalDepois, 0));

  return {
    linhas,
    totalAntes,
    totalDepois,
    variacaoPct: variacaoPercentual(totalAntes, totalDepois),
    contagem,
  };
}

/** Só os itens que efetivamente mudam de custo — é o que a gravação precisa percorrer. */
export function itensParaAtualizar(relatorio: RelatorioImpacto): LinhaImpacto[] {
  return relatorio.linhas.filter((l) => l.situacao === "alterado");
}
