import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { propostaCompostaParaEditor } from "@/modules/comercial/proposta-composta/queries";
import { ComporPropostaView } from "@/components/comercial/compor-proposta-view";

export const metadata: Metadata = { title: "Compor proposta" };

/** Editor da proposta composta (ADR-0006). Proposta que não é composta cai em 404: o editor de
 *  itens/condições e a externa têm cada um o seu caminho. */
export default async function ComporPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("comercial", "gerir");
  const { id } = await params;
  const [proposta, disciplinas, config] = await Promise.all([
    propostaCompostaParaEditor(id),
    catalogoDisciplinas(),
    getConfigComercial(),
  ]);
  if (!proposta) notFound();
  return (
    <ComporPropostaView
      proposta={proposta}
      disciplinas={disciplinas.map((d) => d.nome)}
      descontoMaxSemJustificativa={config.descontoMaxSemJustificativa}
    />
  );
}
