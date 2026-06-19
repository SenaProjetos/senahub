import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";
import { LicitacoesConfigView } from "@/components/configuracoes/licitacoes-config-view";

export const metadata: Metadata = { title: "Licitações — Configurações" };

export default async function LicitacoesConfigPage() {
  await requireRole("admin");
  const config = await getConfigLicitacoes();
  return <LicitacoesConfigView config={config} />;
}
