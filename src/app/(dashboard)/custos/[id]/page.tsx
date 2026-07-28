import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterOrcamento } from "@/modules/custos/queries";
import { OrcamentoDetalheView } from "@/components/custos/orcamento-detalhe-view";

export const metadata: Metadata = { title: "Orçamento — Engenharia de Custos" };

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("custos", "ver");
  const { id } = await params;
  const [orcamento, podeGerir] = await Promise.all([
    obterOrcamento(id, user),
    can(user.role, "custos", "gerir"),
  ]);
  if (!orcamento) notFound();

  return <OrcamentoDetalheView orcamento={orcamento} podeGerir={podeGerir} />;
}
