import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { GuiaComercialView } from "@/components/comercial/guia-comercial-view";

export const metadata: Metadata = {
  title: "Guia do Comercial",
  description: "Passo a passo para usar o fluxo comercial do primeiro contato ao projeto.",
};

export default async function GuiaComercialPage() {
  await requirePermission("comercial", "ver");

  return <GuiaComercialView />;
}
