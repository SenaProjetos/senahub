/** Aging de recebíveis/pagáveis: classifica um vencimento em faixas de atraso. */

export type FaixaAging = "a_vencer" | "d1_30" | "d31_60" | "d61_90" | "d91_120" | "d120_mais";

export const FAIXAS_AGING: FaixaAging[] = ["a_vencer", "d1_30", "d31_60", "d61_90", "d91_120", "d120_mais"];

export const FAIXA_LABEL: Record<FaixaAging, string> = {
  a_vencer: "A vencer",
  d1_30: "1–30 dias",
  d31_60: "31–60 dias",
  d61_90: "61–90 dias",
  d91_120: "91–120 dias",
  d120_mais: "120+ dias",
};

/** Cor semântica por faixa (classes Tailwind do tema). */
export const FAIXA_COR: Record<FaixaAging, string> = {
  a_vencer: "bg-muted-foreground/40",
  d1_30: "bg-warning",
  d31_60: "bg-warning",
  d61_90: "bg-destructive/70",
  d91_120: "bg-destructive/85",
  d120_mais: "bg-destructive",
};

export function calcularAging(vencimento: Date, hoje: Date = new Date()): { faixa: FaixaAging; diasAtraso: number } {
  const dias = Math.floor((hoje.getTime() - vencimento.getTime()) / 86_400_000);
  if (dias <= 0) return { faixa: "a_vencer", diasAtraso: 0 };
  if (dias <= 30) return { faixa: "d1_30", diasAtraso: dias };
  if (dias <= 60) return { faixa: "d31_60", diasAtraso: dias };
  if (dias <= 90) return { faixa: "d61_90", diasAtraso: dias };
  if (dias <= 120) return { faixa: "d91_120", diasAtraso: dias };
  return { faixa: "d120_mais", diasAtraso: dias };
}
