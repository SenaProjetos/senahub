import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarParceiros } from "@/modules/comercial/queries";
import { ParceirosView } from "@/components/comercial/parceiros-view";

export const metadata: Metadata = { title: "Parceiros" };

export default async function ParceirosPage() {
  await requirePermission("comercial", "gerir");
  const parceiros = await listarParceiros();
  return <ParceirosView parceiros={parceiros} />;
}
