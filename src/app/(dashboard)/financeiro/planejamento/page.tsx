import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarPlanos, opcoesPlanejamento } from "@/modules/financeiro/planejamento/queries";
import { PlanejamentoListaView } from "@/components/financeiro/planejamento/planejamento-lista-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Pagamentos em lote" };

export default async function PlanejamentoPage() {
  await requirePermission("financeiro", "gerir");
  const [planos, opcoes] = await Promise.all([listarPlanos(), opcoesPlanejamento()]);
  return <PlanejamentoListaView subnav={<NavFinanceiro />} planos={planos} opcoes={opcoes} />;
}
