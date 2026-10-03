import type { Metadata } from "next";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  orcamentoPorCategoria,
  orcamentoPorCentro,
  serieMensalResultado,
  categoriasFinanceiras,
} from "@/modules/financeiro/relatorios/queries";
import { OrcamentoView } from "@/components/financeiro/orcamento-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { NavResultados } from "@/components/financeiro/nav-resultados";
export const metadata: Metadata = { title: "Orçamento anual" };

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const user = await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [orcamento, porCentro, serieMensal, categorias, podeGerir] = await Promise.all([
    orcamentoPorCategoria(utcInicioDoDia(ano, 0), utcFimDoDia(ano, 11, 31)),
    orcamentoPorCentro(utcInicioDoDia(ano, 0), utcFimDoDia(ano, 11, 31)),
    serieMensalResultado(ano),
    categoriasFinanceiras(),
    can(user, "financeiro", "gerir"),
  ]);
  return (
    <OrcamentoView subnav={<><NavFinanceiro /><NavResultados /></>}
      ano={ano}
      orcamento={orcamento}
      porCentro={porCentro}
      serieMensal={serieMensal}
      categorias={categorias}
      podeGerir={podeGerir}
    />
  );
}
