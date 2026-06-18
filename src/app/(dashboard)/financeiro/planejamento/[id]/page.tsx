import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterPlano, contasEmAberto } from "@/modules/financeiro/planejamento/queries";
import { PlanejamentoMesaView } from "@/components/financeiro/planejamento/planejamento-mesa-view";

export const metadata: Metadata = { title: "Cenário de planejamento" };

export default async function PlanejamentoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("financeiro", "gerir");
  const { id } = await params;
  const plano = await obterPlano(id);
  if (!plano) notFound();
  const jaNoPlano = plano.linhas.map((l) => l.lancamentoId);
  const disponiveis = await contasEmAberto({ excluirIds: jaNoPlano });
  return <PlanejamentoMesaView plano={plano} disponiveis={disponiveis} />;
}
