import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { dadosContas, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { ContasPagarReceberView } from "@/components/financeiro/lancamentos/contas-pagar-receber-view";

export const metadata: Metadata = { title: "Contas a pagar e receber" };

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("financeiro", "ver");
  const [{ tab }, itens, opcoes, podeGerir] = await Promise.all([
    searchParams,
    dadosContas(),
    opcoesLancamento(),
    can(user.role, "financeiro", "gerir"),
  ]);
  const tabInicial = tab === "receita" ? "receita" : "despesa";
  return <ContasPagarReceberView itens={itens} opcoes={opcoes} tabInicial={tabInicial} podeGerir={podeGerir} />;
}
