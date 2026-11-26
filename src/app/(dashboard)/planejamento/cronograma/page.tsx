import type { Metadata } from "next";
import { GanttChart } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { inicioDoDiaUtc } from "@/lib/data";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { paraDia } from "@/modules/planejamento/agenda";
import { periodoDoPlanejamentoGeral } from "@/modules/planejamento/planejamento-geral";
import { planejamentoGeral } from "@/modules/planejamento/planejamento-geral-queries";
import { PlanejamentoGeralView } from "@/components/planejamento/planejamento-geral-view";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Planejamento geral" };

/**
 * Planejamento geral (pool de recursos, parte 5): todos os cronogramas, aprovados e rascunhos, numa tabela e num Gantt, só
 * para ver. Vê quem vê Recursos (decisão 7) e vê as datas do planejamento. `?de=` e `?ate=` = o período (a conta de
 * conflito depende dele); os outros filtros ficam no navegador.
 */
export default async function PlanejamentoGeralPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const user = await requirePermission("recursos", "ver");
  // O Planejamento geral é linha do tempo: sem datas (decisão #3) não sobra nada.
  if (!(await podeVerDatasDoPlanejamento(user))) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Planejamento geral" descricao="Todos os cronogramas lado a lado." />
        <EmptyState
          icon={GanttChart}
          title="O Planejamento geral mostra datas"
          description="O seu perfil vê a estrutura do planejamento de cada projeto, sem as datas."
          className="py-16"
        />
      </div>
    );
  }
  const sp = await searchParams;
  // `hoje` do servidor: a marca do dia tem de ser a mesma no HTML e depois da hidratação.
  const hoje = paraDia(inicioDoDiaUtc());
  const dados = await planejamentoGeral(periodoDoPlanejamentoGeral(sp.de, sp.ate, hoje), hoje);
  return <PlanejamentoGeralView dados={dados} />;
}
