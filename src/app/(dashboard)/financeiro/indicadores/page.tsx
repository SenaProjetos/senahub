import type { Metadata } from "next";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { evolucaoReceitaDespesaMeses, indicadoresGerenciais } from "@/modules/financeiro/relatorios/queries";
import { IndicadoresView } from "@/components/financeiro/relatorios/indicadores-view";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { NavResultados } from "@/components/financeiro/nav-resultados";

export const metadata: Metadata = { title: "Indicadores" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePermission("financeiro", "resultados");
  const sp = await searchParams;
  const hoje = new Date();
  const [ano, mes] = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes!.split("-").map(Number) : [hoje.getFullYear(), hoje.getMonth() + 1];
  const de = utcInicioDoDia(ano, mes - 1);
  const ate = utcFimDoDia(ano, mes, 0);

  const [ind, evolucao] = await Promise.all([indicadoresGerenciais(de, ate), evolucaoReceitaDespesaMeses(ate, 6)]);

  return (
    <IndicadoresView
      ind={ind}
      evolucao={evolucao}
      mesRotulo={`${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`}
      subnav={
        <>
          <NavFinanceiro />
          <NavResultados />
        </>
      }
    />
  );
}
