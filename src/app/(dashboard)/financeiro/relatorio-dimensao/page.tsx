import type { Metadata } from "next";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { relatorioPorDimensao, type DimensaoRelatorio } from "@/modules/financeiro/relatorios/queries";
import { RelatorioDimensaoView } from "@/components/financeiro/relatorios/relatorio-dimensao-view";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { NavResultados } from "@/components/financeiro/nav-resultados";

export const metadata: Metadata = { title: "Relatório por dimensão" };

const DIMENSOES: DimensaoRelatorio[] = ["categoria", "centro", "contato", "projeto", "tag"];

export default async function RelatorioDimensaoPage({
  searchParams,
}: {
  searchParams: Promise<{ dimensao?: string; de?: string; ate?: string }>;
}) {
  await requirePermission("financeiro", "resultados");
  const sp = await searchParams;
  const hoje = new Date();
  const dimensao = DIMENSOES.includes(sp.dimensao as DimensaoRelatorio) ? (sp.dimensao as DimensaoRelatorio) : "categoria";
  const de = sp.de ? new Date(sp.de) : utcInicioDoDia(hoje.getFullYear(), hoje.getMonth());
  const ate = sp.ate ? new Date(sp.ate) : utcFimDoDia(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const relatorio = await relatorioPorDimensao(dimensao, de, ate);

  return (
    <RelatorioDimensaoView
      relatorio={relatorio}
      subnav={
        <>
          <NavFinanceiro />
          <NavResultados />
        </>
      }
    />
  );
}
