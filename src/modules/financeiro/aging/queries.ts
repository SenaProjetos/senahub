import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularAging, FAIXAS_AGING, FAIXA_LABEL, type FaixaAging } from "@/lib/aging";

export type AgingFaixa = { faixa: FaixaAging; label: string; total: number; qtd: number };
export type AgingTopItem = { id: string; descricao: string; valor: number; diasAtraso: number; vencimento: string };
export type AgingReport = {
  totalVencido: number;
  totalAVencer: number;
  porFaixa: AgingFaixa[];
  topVencidos: AgingTopItem[];
};

/**
 * Aging dos lançamentos PREVISTOS de um tipo (receita = AR, despesa = AP),
 * agrupados por faixa de atraso. Usa `vencimento` (cai para `data` se ausente).
 */
export async function agingReport(tipo: "receita" | "despesa"): Promise<AgingReport> {
  const lancs = await prisma.lancamento.findMany({
    where: { tipo, status: "previsto" },
    select: { id: true, descricao: true, valor: true, vencimento: true, data: true },
  });

  const hoje = new Date();
  const acc = new Map<FaixaAging, { total: number; qtd: number }>();
  for (const f of FAIXAS_AGING) acc.set(f, { total: 0, qtd: 0 });

  let totalVencido = 0;
  let totalAVencer = 0;
  const vencidos: AgingTopItem[] = [];

  for (const l of lancs) {
    const venc = l.vencimento ?? l.data;
    const { faixa, diasAtraso } = calcularAging(venc, hoje);
    const valor = Number(l.valor);
    const cur = acc.get(faixa)!;
    cur.total += valor;
    cur.qtd += 1;
    if (faixa === "a_vencer") {
      totalAVencer += valor;
    } else {
      totalVencido += valor;
      vencidos.push({
        id: l.id,
        descricao: l.descricao,
        valor,
        diasAtraso,
        vencimento: venc.toISOString().slice(0, 10),
      });
    }
  }

  vencidos.sort((a, b) => b.diasAtraso - a.diasAtraso);

  return {
    totalVencido,
    totalAVencer,
    porFaixa: FAIXAS_AGING.map((f) => ({ faixa: f, label: FAIXA_LABEL[f], total: acc.get(f)!.total, qtd: acc.get(f)!.qtd })),
    topVencidos: vencidos.slice(0, 5),
  };
}
