import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { cronogramaProjetosAtivos } from "@/modules/planejamento/queries";
import { CronogramaGeralView } from "@/components/planejamento/cronograma-geral-view";

export const metadata: Metadata = { title: "Cronograma geral" };

export default async function CronogramaGeralPage() {
  await requirePermission("planejamento", "ver");
  const projetos = await cronogramaProjetosAtivos();
  return <CronogramaGeralView projetos={projetos} />;
}
