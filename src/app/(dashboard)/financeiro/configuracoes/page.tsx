import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigFinanceiro, getAliquotas } from "@/modules/financeiro/config/queries";
import { getNiveisAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { ConfiguracoesView } from "@/components/financeiro/config/configuracoes-view";

export const metadata: Metadata = { title: "Configurações financeiras" };

export default async function ConfiguracoesPage() {
  await requirePermission("financeiro", "gerir");
  const [config, aliquotas, niveis] = await Promise.all([getConfigFinanceiro(), getAliquotas(), getNiveisAprovacao()]);
  return <ConfiguracoesView config={config} aliquotas={aliquotas} niveis={niveis} />;
}
