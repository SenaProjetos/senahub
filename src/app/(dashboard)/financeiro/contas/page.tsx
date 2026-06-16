import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { dadosContas, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { ContasPagarReceberView } from "@/components/financeiro/lancamentos/contas-pagar-receber-view";

export const metadata: Metadata = { title: "Contas a pagar e receber" };

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const [{ tab }, itens, opcoes] = await Promise.all([searchParams, dadosContas(), opcoesLancamento()]);
  const tabInicial = tab === "receita" ? "receita" : "despesa";
  return <ContasPagarReceberView itens={itens} opcoes={opcoes} tabInicial={tabInicial} />;
}
