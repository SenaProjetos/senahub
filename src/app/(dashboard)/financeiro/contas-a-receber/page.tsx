import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { contasAReceber, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { ContasView } from "@/components/financeiro/lancamentos/contas-view";

export const metadata: Metadata = { title: "Contas a receber" };

export default async function ContasAReceberPage() {
  await requirePermission("financeiro", "ver");
  const [itens, opcoes] = await Promise.all([contasAReceber(), opcoesLancamento()]);
  return <ContasView itens={itens} opcoes={opcoes} tipo="receita" />;
}
