import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { dadosContas, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { ContasPagarReceberView } from "@/components/financeiro/lancamentos/contas-pagar-receber-view";
import { ParcelasAFaturarCard } from "@/components/financeiro/lancamentos/parcelas-a-faturar-card";
import { parcelasAFaturar } from "@/modules/juridico/contrato/parcelas-a-faturar-queries";

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
    can(user, "financeiro", "gerir"),
  ]);
  const tabInicial = tab === "receita" ? "receita" : "despesa";
  // Faturar é lançar dinheiro: a lista de parcelas a faturar é de quem gere o financeiro.
  const aFaturar = podeGerir ? await parcelasAFaturar() : [];
  return (
    <ContasPagarReceberView
      itens={itens}
      opcoes={opcoes}
      tabInicial={tabInicial}
      podeGerir={podeGerir}
      topoReceita={aFaturar.length > 0 ? <ParcelasAFaturarCard parcelas={aFaturar} /> : undefined}
    />
  );
}
