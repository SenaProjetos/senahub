import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterLead, funilCompleto } from "@/modules/comercial/queries";
import type { LeadItem } from "@/modules/comercial/queries";
import { LeadDetalheView } from "@/components/comercial/lead-detalhe-view";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("comercial", "ver");
  const { id } = await params;
  const [lead, etapas] = await Promise.all([obterLead(id), funilCompleto()]);
  if (!lead) notFound();

  // Normaliza p/ o shape de LeadItem usado pelo modal/cards
  // (Decimal → number; _count.propostas a partir da relação).
  const leadItem: LeadItem = {
    ...lead,
    valorEstimado: lead.valorEstimado != null ? Number(lead.valorEstimado) : null,
    _count: { propostas: lead.propostas.length },
  };

  return (
    <LeadDetalheView
      lead={leadItem}
      etapaAtual={{ id: lead.etapa.id, nome: lead.etapa.nome, cor: lead.etapa.cor }}
      etapas={etapas.map((e) => ({ id: e.id, nome: e.nome }))}
      propostas={lead.propostas}
    />
  );
}
