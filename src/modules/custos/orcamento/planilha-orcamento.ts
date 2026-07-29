/**
 * Planilha orçamentária — achata a árvore em linhas prontas para XLSX/PDF. PURO, sem I/O.
 *
 * Duas formas, exigidas pelo briefing:
 * - **sintética**: uma linha por nó (grupo e serviço) — a planilha orçamentária clássica.
 * - **analítica**: a sintética + as linhas da composição de cada serviço (insumo/auxiliar,
 *   coeficiente, preço unitário, subtotal), indentadas sob ele.
 *
 * O XLSX e o PDF consomem ESTE módulo — é o que impede os dois formatos de divergirem em número.
 */
import type { NoArvore } from "../orcamento-arvore";
import { bdiEfetivo } from "../orcamento-arvore";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LinhaPlanilha = {
  /** Código WBS (1.2.3) do nó, ou o código do insumo/composição nas linhas analíticas. */
  codigo: string;
  /** 0 = raiz. Nas linhas de composição, é o nível do serviço + 1. */
  nivel: number;
  tipo: "grupo" | "servico" | "composicao_item";
  descricao: string;
  unidade: string;
  /** Quantidade do item; nas linhas de composição, é o coeficiente. */
  quantidade: number | null;
  custoUnitario: number | null;
  /** BDI efetivo (%) aplicado nesta linha. Null nas linhas de composição (BDI é do serviço). */
  bdiPercentual: number | null;
  totalSemBdi: number;
  totalComBdi: number;
};

export type ContextoPlanilha = {
  /** BDI do orçamento, usado quando nem o item nem os pais definem um. */
  bdiOrcamento: number;
  /** Totais materializados por id de nó (`totalSemBdi`/`totalComBdi` gravados). */
  totais: Map<string, { totalSemBdi: number; totalComBdi: number }>;
  /** Código WBS por id de nó. */
  codigos: Map<string, string>;
  /** Descrição/unidade por id de nó. */
  meta: Map<string, { descricao: string; unidade: string | null }>;
};

/** Item de composição já resolvido (vindo de C1) para a forma analítica. */
export type ItemComposicaoResolvido = {
  codigo: string;
  descricao: string;
  unidade: string;
  coeficiente: number;
  /** Preço unitário do insumo na base escolhida; null = sem cotação. */
  precoUnitario: number | null;
};

function percorrer(nos: NoArvore[], nivel: number, ctx: ContextoPlanilha, visita: (no: NoArvore, nivel: number, caminho: NoArvore[]) => void, caminho: NoArvore[] = []) {
  for (const no of nos) {
    const proximoCaminho = [no, ...caminho];
    visita(no, nivel, proximoCaminho);
    if (no.filhos.length > 0) percorrer(no.filhos, nivel + 1, ctx, visita, proximoCaminho);
  }
}

function linhaDoNo(no: NoArvore, nivel: number, caminho: NoArvore[], ctx: ContextoPlanilha): LinhaPlanilha {
  const totais = ctx.totais.get(no.id) ?? { totalSemBdi: 0, totalComBdi: 0 };
  const meta = ctx.meta.get(no.id);
  const ehServico = no.tipo === "servico";
  return {
    codigo: ctx.codigos.get(no.id) ?? "",
    nivel,
    tipo: no.tipo,
    descricao: meta?.descricao ?? "",
    unidade: meta?.unidade ?? "",
    quantidade: ehServico ? no.quantidade : null,
    custoUnitario: ehServico ? no.custoUnitario : null,
    bdiPercentual: bdiEfetivo(caminho, ctx.bdiOrcamento),
    totalSemBdi: totais.totalSemBdi,
    totalComBdi: totais.totalComBdi,
  };
}

/** Planilha sintética: uma linha por nó da árvore, em ordem de leitura (pré-ordem). */
export function linhasSinteticas(raizes: NoArvore[], ctx: ContextoPlanilha): LinhaPlanilha[] {
  const linhas: LinhaPlanilha[] = [];
  percorrer(raizes, 0, ctx, (no, nivel, caminho) => {
    linhas.push(linhaDoNo(no, nivel, caminho, ctx));
  });
  return linhas;
}

/**
 * Planilha analítica: a sintética, com a composição de cada serviço explodida logo abaixo dele.
 * `composicoesPorItem` mapeia id do item de orçamento → itens da composição já resolvidos.
 */
export function linhasAnaliticas(
  raizes: NoArvore[],
  composicoesPorItem: Map<string, ItemComposicaoResolvido[]>,
  ctx: ContextoPlanilha,
): LinhaPlanilha[] {
  const linhas: LinhaPlanilha[] = [];
  percorrer(raizes, 0, ctx, (no, nivel, caminho) => {
    linhas.push(linhaDoNo(no, nivel, caminho, ctx));
    if (no.tipo !== "servico") return;
    const itens = composicoesPorItem.get(no.id);
    if (!itens) return;
    for (const item of itens) {
      const subtotal = item.precoUnitario === null ? 0 : round2(item.precoUnitario * item.coeficiente);
      linhas.push({
        codigo: item.codigo,
        nivel: nivel + 1,
        tipo: "composicao_item",
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.coeficiente,
        custoUnitario: item.precoUnitario,
        bdiPercentual: null,
        totalSemBdi: subtotal,
        totalComBdi: subtotal,
      });
    }
  });
  return linhas;
}

export type ResumoGrupo = {
  codigo: string;
  descricao: string;
  totalSemBdi: number;
  totalComBdi: number;
  /** Participação no total COM BDI do orçamento (%). */
  participacaoPct: number;
};

/** Resumo por grupo de 1º nível — rodapé da planilha e base da curva de participação. */
export function resumoPorGrupo(raizes: NoArvore[], ctx: ContextoPlanilha): ResumoGrupo[] {
  const totalGeral = raizes.reduce((s, no) => s + (ctx.totais.get(no.id)?.totalComBdi ?? 0), 0);
  return raizes.map((no) => {
    const t = ctx.totais.get(no.id) ?? { totalSemBdi: 0, totalComBdi: 0 };
    return {
      codigo: ctx.codigos.get(no.id) ?? "",
      descricao: ctx.meta.get(no.id)?.descricao ?? "",
      totalSemBdi: t.totalSemBdi,
      totalComBdi: t.totalComBdi,
      participacaoPct: totalGeral === 0 ? 0 : round2((t.totalComBdi / totalGeral) * 100),
    };
  });
}

/** Totais gerais do orçamento (soma das raízes). */
export function totaisGerais(raizes: NoArvore[], ctx: ContextoPlanilha): { semBdi: number; comBdi: number } {
  let semBdi = 0;
  let comBdi = 0;
  for (const no of raizes) {
    const t = ctx.totais.get(no.id);
    if (!t) continue;
    semBdi += t.totalSemBdi;
    comBdi += t.totalComBdi;
  }
  return { semBdi: round2(semBdi), comBdi: round2(comBdi) };
}
