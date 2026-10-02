import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { carregarCarteira, contasParaInvestir } from "@/modules/financeiro/investimentos/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { CarteiraView } from "@/components/financeiro/investimentos/carteira-view";

export const metadata: Metadata = { title: "Investimentos" };

/** Carteira de investimentos (M4). Ler exige ver o Financeiro; aportar, resgatar e registrar rendimento, `gerir`. */
export default async function InvestimentosPage() {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");
  const [ativos, contas, podeGerir] = await Promise.all([carregarCarteira(), contasParaInvestir(), can(user, "financeiro", "gerir")]);
  return <CarteiraView ativos={ativos} contas={contas} podeGerir={podeGerir} subnav={<NavFinanceiro />} />;
}
