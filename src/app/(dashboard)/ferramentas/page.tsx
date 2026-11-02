import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GaleriaView } from "@/components/ferramentas/galeria-view";

export const metadata: Metadata = { title: "Ferramentas de Engenharia" };

export default async function FerramentasPage() {
  const user = await requirePermission("ferramentas", "usar");
  // Calculadora sem validação do engenheiro só aparece para quem gere as ferramentas.
  const podeVerEmValidacao = await can(user, "ferramentas", "gerir");
  // GaleriaView importa o registry no cliente (o ícone é componente e não cruza o boundary RSC).
  return <GaleriaView podeVerEmValidacao={podeVerEmValidacao} />;
}
