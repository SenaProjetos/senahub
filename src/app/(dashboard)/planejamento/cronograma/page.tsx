import type { Metadata } from "next";
import { GanttChart } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { cronogramaProjetosAtivos } from "@/modules/planejamento/queries";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { CronogramaGeralView } from "@/components/planejamento/cronograma-geral-view";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Cronograma geral" };

export default async function CronogramaGeralPage() {
  const user = await requirePermission("planejamento", "ver");
  // O cronograma geral é só linha do tempo, de TODOS os projetos com EAP: sem datas (decisão #3) não sobra nada.
  if (!(await podeVerDatasDoPlanejamento(user))) {
    return (
      <EmptyState
        icon={GanttChart}
        title="O cronograma geral mostra datas"
        description="O seu perfil vê a estrutura do planejamento de cada projeto, sem as datas."
        className="py-16"
      />
    );
  }
  const projetos = await cronogramaProjetosAtivos();
  return <CronogramaGeralView projetos={projetos} />;
}
