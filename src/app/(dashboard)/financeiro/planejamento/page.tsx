import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarPlanos, opcoesPlanejamento } from "@/modules/financeiro/planejamento/queries";
import { PlanejamentoListaView } from "@/components/financeiro/planejamento/planejamento-lista-view";

export const metadata: Metadata = { title: "Planejamento de pagamentos" };

export default async function PlanejamentoPage() {
  await requirePermission("financeiro", "gerir");
  const [planos, opcoes] = await Promise.all([listarPlanos(), opcoesPlanejamento()]);
  return <PlanejamentoListaView planos={planos} opcoes={opcoes} />;
}
