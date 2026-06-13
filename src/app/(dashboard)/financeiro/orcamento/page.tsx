import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { orcamentoPorCategoria, serieMensalResultado } from "@/modules/financeiro/relatorios/queries";
import { OrcamentoView } from "@/components/financeiro/orcamento-view";

export const metadata: Metadata = { title: "Orçamento anual" };

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [orcamento, serieMensal] = await Promise.all([
    orcamentoPorCategoria(new Date(ano, 0, 1), new Date(ano, 11, 31, 23, 59, 59)),
    serieMensalResultado(ano),
  ]);
  return <OrcamentoView ano={ano} orcamento={orcamento} serieMensal={serieMensal} />;
}
