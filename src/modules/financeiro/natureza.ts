/**
 * Onde um movimento conta, pela natureza da categoria (ADR-0008). Puro, sem I/O.
 *
 * `foraDoResultado` = NÃO participa do resultado econômico (DRE). Continua sendo entrada ou saída
 * de caixa. Transferência entre contas próprias muda o saldo de cada conta, mas nada do resto.
 */
import type { Natureza } from "@/modules/financeiro/liquidez/tipos";

export type ClassificacaoMovimento = {
  /** Muda o saldo da conta em que cai (sempre: dinheiro que se moveu). */
  entraNoCaixa: boolean;
  /** Receita/despesa da DRE e dos KPIs de receita, despesa e resultado. */
  entraNoResultado: boolean;
  /** Fluxo de caixa por atividade (pelo `grupoDfc` da categoria). */
  entraNoDfc: boolean;
  /** Entradas e compromissos do planejador, barras do dia, alerta de déficit. */
  entraNosTotaisDoPlanejador: boolean;
  /** Média de saídas dos dias de caixa. */
  entraEmDiasDeCaixa: boolean;
};

const TABELA: Record<Natureza, ClassificacaoMovimento> = {
  resultado: {
    entraNoCaixa: true,
    entraNoResultado: true,
    entraNoDfc: true,
    entraNosTotaisDoPlanejador: true,
    entraEmDiasDeCaixa: true,
  },
  fora_do_resultado: {
    entraNoCaixa: true,
    entraNoResultado: false,
    entraNoDfc: true,
    entraNosTotaisDoPlanejador: true,
    entraEmDiasDeCaixa: false,
  },
  transferencia: {
    entraNoCaixa: true,
    entraNoResultado: false,
    entraNoDfc: false,
    entraNosTotaisDoPlanejador: false,
    entraEmDiasDeCaixa: false,
  },
};

export function classificarMovimento(natureza: Natureza): ClassificacaoMovimento {
  return TABELA[natureza];
}

export function foraDoResultado(natureza: Natureza): boolean {
  return natureza !== "resultado";
}

/**
 * Pedaços de `where` do Prisma — a forma ÚNICA de aplicar a natureza numa consulta de dinheiro.
 * São objetos simples de propósito: `natureza.ts` é puro e não importa Prisma (o teste-guarda confere).
 *
 * `SO_RESULTADO`: DRE, KPIs de receita/despesa/resultado, margem, rentabilidade, orçamento, fechamento.
 * `SEM_TRANSFERENCIA`: caixa, DFC, aging, balanço — a perna de transferência move conta, não é receita
 * nem despesa, e somá-la dos dois lados infla os dois.
 *
 * Consulta nova que soma dinheiro usa um dos dois; `natureza-ok:` com o motivo é o escape documentado
 * (`relatorios/natureza-nas-consultas.test.ts` acusa quem esquecer).
 */
export const SO_RESULTADO = { categoria: { natureza: "resultado" } } as const;
export const SEM_TRANSFERENCIA = { categoria: { natureza: { not: "transferencia" } } } as const;
