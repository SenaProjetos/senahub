import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarLancamentos, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { LancamentosView } from "@/components/financeiro/lancamentos/lancamentos-view";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function LancamentosPage() {
  await requirePermission("financeiro", "ver");
  const [lancamentos, opcoes] = await Promise.all([listarLancamentos(), opcoesLancamento()]);
  return <LancamentosView lancamentos={lancamentos} opcoes={opcoes} />;
}
