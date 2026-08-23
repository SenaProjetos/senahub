import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { ConfiguracoesComercialView } from "@/components/comercial/configuracoes-view";

export const metadata: Metadata = { title: "Configurações do Comercial" };

export default async function ConfiguracoesComercialPage() {
  await requirePermission("comercial", "gerir");
  const config = await getConfigComercial();
  return <ConfiguracoesComercialView config={config} />;
}
