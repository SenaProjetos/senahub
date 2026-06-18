import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigFinanceiro } from "@/modules/financeiro/config/queries";
import { ConfiguracoesView } from "@/components/financeiro/config/configuracoes-view";

export const metadata: Metadata = { title: "Configurações financeiras" };

export default async function ConfiguracoesPage() {
  await requirePermission("financeiro", "gerir");
  const config = await getConfigFinanceiro();
  return <ConfiguracoesView config={config} />;
}
