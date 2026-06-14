import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  orcamentoPorCategoria,
  serieMensalResultado,
  categoriasFinanceiras,
} from "@/modules/financeiro/relatorios/queries";
import { OrcamentoView } from "@/components/financeiro/orcamento-view";

export const metadata: Metadata = { title: "Orçamento anual" };

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const user = await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [orcamento, serieMensal, categorias, podeGerir] = await Promise.all([
    orcamentoPorCategoria(new Date(ano, 0, 1), new Date(ano, 11, 31, 23, 59, 59)),
    serieMensalResultado(ano),
    categoriasFinanceiras(),
    can(user.role, "financeiro", "gerir"),
  ]);
  return (
    <OrcamentoView
      ano={ano}
      orcamento={orcamento}
      serieMensal={serieMensal}
      categorias={categorias}
      podeGerir={podeGerir}
    />
  );
}
