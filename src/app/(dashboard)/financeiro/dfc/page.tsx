import type { Metadata } from "next";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { relatorioDFC, categoriasParaDfc } from "@/modules/financeiro/relatorios/queries";
import { DfcView } from "@/components/financeiro/dfc-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { NavResultados } from "@/components/financeiro/nav-resultados";
export const metadata: Metadata = { title: "DFC" };

export default async function DfcPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const user = await requirePermission("financeiro", "resultados");
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [dfc, categorias, podeGerir] = await Promise.all([
    relatorioDFC(utcInicioDoDia(ano, 0), utcFimDoDia(ano, 11, 31)),
    categoriasParaDfc(),
    can(user, "financeiro", "gerir"),
  ]);
  return <DfcView subnav={<><NavFinanceiro /><NavResultados /></>} ano={ano} dfc={dfc} categorias={categorias} podeGerir={podeGerir} />;
}
