import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigFinanceiro, getAliquotas, getConfigExclusao } from "@/modules/financeiro/config/queries";
import { getNiveisAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { ConfiguracoesView } from "@/components/financeiro/config/configuracoes-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Configurações financeiras" };

export default async function ConfiguracoesPage() {
  await requirePermission("financeiro", "gerir");
  const [config, aliquotas, niveis, exclusao] = await Promise.all([
    getConfigFinanceiro(),
    getAliquotas(),
    getNiveisAprovacao(),
    getConfigExclusao(),
  ]);
  return <ConfiguracoesView subnav={<NavFinanceiro />} config={config} aliquotas={aliquotas} niveis={niveis} exclusao={exclusao} />;
}
