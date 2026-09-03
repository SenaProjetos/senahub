import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";
import { LicitacoesConfigView } from "@/components/configuracoes/licitacoes-config-view";

export const metadata: Metadata = { title: "Licitações — Configurações" };

export default async function LicitacoesConfigPage() {
  await requirePermission("configuracoes", "licitacoes");
  const config = await getConfigLicitacoes();
  return <LicitacoesConfigView config={config} />;
}
