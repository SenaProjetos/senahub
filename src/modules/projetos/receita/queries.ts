import "server-only";
import { prisma } from "@/lib/prisma";

/** Tag que identifica os lançamentos de receita gerados como parcelas de contrato. */
export const TAG_PARCELA_CONTRATO = "contrato";

/**
 * Resumo de receita/contrato de um projeto: valor de contrato, total da composição
 * de preço e as parcelas (recebíveis = lançamentos de receita marcados como contrato).
 */
export async function receitaProjeto(projetoId: string) {
  const [projeto, composicao, parcelas] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { valorContrato: true, tipo: true } }),
    prisma.projetoComposicaoPreco.findUnique({
      where: { projetoId },
      select: { itens: { select: { quantidade: true, valorUnitario: true } } },
    }),
    prisma.lancamento.findMany({
      where: { projetoId, tipo: "receita", tags: { has: TAG_PARCELA_CONTRATO }, status: { not: "cancelado" } },
      orderBy: [{ vencimento: "asc" }, { data: "asc" }],
      select: { id: true, descricao: true, valor: true, valorEfetivo: true, status: true, vencimento: true, data: true },
    }),
  ]);

  const totalComposicao = (composicao?.itens ?? []).reduce(
    (s, it) => s + Number(it.quantidade) * Number(it.valorUnitario),
    0,
  );

  let previsto = 0;
  let confirmado = 0;
  for (const p of parcelas) {
    if (p.status === "confirmado") confirmado += Number(p.valorEfetivo ?? p.valor);
    else previsto += Number(p.valor);
  }

  const valorContrato = projeto?.valorContrato != null ? Number(projeto.valorContrato) : null;
  const faturadoTotal = previsto + confirmado;

  return {
    valorContrato,
    tipo: projeto?.tipo ?? "particular",
    totalComposicao,
    parcelas: parcelas.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      valor: Number(p.valor),
      status: p.status,
      vencimento: (p.vencimento ?? p.data).toISOString().slice(0, 10),
    })),
    faturadoPrevisto: previsto,
    faturadoConfirmado: confirmado,
    faturadoTotal,
    // Quanto do contrato ainda não virou parcela (recebível).
    aFaturar: valorContrato != null ? Math.round((valorContrato - faturadoTotal) * 100) / 100 : null,
  };
}
