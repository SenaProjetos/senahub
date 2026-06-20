export type ItemSerie = { valor: number; data: Date };
import { formatarMesCurto } from "@/lib/utils";
export type BucketReceita = {
  ano: number;
  mes: number;
  rotulo: string;
  realizado: number;
  previsto: number;
};

/**
 * Distribui receita realizada e prevista em buckets mensais.
 * `confirmados` traz {valor efetivo, dataConfirmacao}; `previstos` traz
 * {valor, vencimento} de TODA receita do período (previsto original).
 */
export function montarSerieReceita(
  confirmados: ItemSerie[],
  previstos: ItemSerie[],
  ref: Date,
  meses = 6,
): BucketReceita[] {
  const buckets: BucketReceita[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - (meses - 1) + i, 1);
    buckets.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      rotulo: formatarMesCurto(d),
      realizado: 0,
      previsto: 0,
    });
  }
  const idx = (ano: number, mes: number) =>
    buckets.findIndex((b) => b.ano === ano && b.mes === mes);

  for (const l of confirmados) {
    const i = idx(l.data.getFullYear(), l.data.getMonth());
    if (i >= 0) buckets[i].realizado += l.valor;
  }
  for (const l of previstos) {
    const i = idx(l.data.getFullYear(), l.data.getMonth());
    if (i >= 0) buckets[i].previsto += l.valor;
  }
  return buckets;
}
