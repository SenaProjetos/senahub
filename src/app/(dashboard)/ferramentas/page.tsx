import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { FERRAMENTAS, porDisciplina } from "@/modules/ferramentas/registry";
import { GaleriaView } from "@/components/ferramentas/galeria-view";

export const metadata: Metadata = { title: "Ferramentas de Engenharia" };

export default async function FerramentasPage() {
  await requirePermission("ferramentas", "usar");
  const grupos = porDisciplina();
  return <GaleriaView ferramentas={FERRAMENTAS} grupos={grupos} />;
}
