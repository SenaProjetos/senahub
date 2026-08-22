import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { campanhasAtivas } from "@/modules/comercial/queries";
import { ImportadorComercialView } from "@/components/comercial/importacao/importador-view";

export const metadata: Metadata = { title: "Importar — Comercial" };

export default async function ImportarComercialPage() {
  await requirePermission("comercial", "gerir");
  const campanhas = await campanhasAtivas();
  return <ImportadorComercialView campanhas={campanhas} />;
}
