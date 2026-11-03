import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { telaContabil } from "@/modules/financeiro/contabil/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { ContabilView } from "@/components/financeiro/contabil/contabil-view";

export const metadata: Metadata = { title: "Integração contábil" };

/**
 * Integração contábil (M5, mock "Integração contábil"): de-para com o plano do contador e exportação do
 * mês fechado. Mesmo gate do Fechamento mensal (`financeiro:fechar`) — as actions conferem de novo.
 */
export default async function ContabilPage({ searchParams }: { searchParams: Promise<{ mes?: string; aba?: string }> }) {
  await requirePermission("financeiro", "fechar");
  const { mes, aba } = await searchParams;
  const dados = await telaContabil(mes);
  return <ContabilView dados={dados} abaInicial={aba === "exportacao" ? "exportacao" : "depara"} subnav={<NavFinanceiro />} />;
}
