import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { CarimbosView } from "@/components/documentos/carimbos-view";

export const metadata: Metadata = { title: "Carimbos de prancha" };

export default async function CarimbosPage() {
  await requirePermission("documentos", "gerir");
  return <CarimbosView />;
}
