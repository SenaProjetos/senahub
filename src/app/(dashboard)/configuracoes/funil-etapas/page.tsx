import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarEtapasFunil } from "@/modules/comercial/queries";
import { FunilEtapasView } from "@/components/configuracoes/funil-etapas-view";

export const metadata: Metadata = { title: "Etapas do funil" };

export default async function FunilEtapasPage() {
  await requirePermission("comercial", "gerir");
  const etapas = await listarEtapasFunil();
  return <FunilEtapasView etapas={etapas} />;
}
