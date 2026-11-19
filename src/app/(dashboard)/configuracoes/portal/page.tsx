import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigResumo } from "@/modules/portal/resumo-service";
import { PortalConfigView } from "@/components/configuracoes/portal-config-view";

export const metadata: Metadata = { title: "Portal do cliente — Configurações" };

export default async function PortalConfigPage() {
  await requirePermission("configuracoes", "gerir");
  const config = await getConfigResumo();
  return <PortalConfigView ativo={config.ativo} desde={config.desde} />;
}
