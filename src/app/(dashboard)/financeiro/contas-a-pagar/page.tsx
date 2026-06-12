import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { contasAPagar, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { ContasView } from "@/components/financeiro/lancamentos/contas-view";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function ContasAPagarPage() {
  await requirePermission("financeiro", "ver");
  const [itens, opcoes] = await Promise.all([contasAPagar(), opcoesLancamento()]);
  return <ContasView itens={itens} opcoes={opcoes} tipo="despesa" />;
}
