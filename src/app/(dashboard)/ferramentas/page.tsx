import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { GaleriaView } from "@/components/ferramentas/galeria-view";

export const metadata: Metadata = { title: "Ferramentas de Engenharia" };

export default async function FerramentasPage() {
  await requirePermission("ferramentas", "usar");
  // GaleriaView importa o registry no cliente (o ícone é componente e não cruza o boundary RSC).
  return <GaleriaView />;
}
