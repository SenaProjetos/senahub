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
