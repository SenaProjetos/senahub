import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { dadosLivroCaixa, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { LancamentosView } from "@/components/financeiro/lancamentos/lancamentos-view";

export const metadata: Metadata = { title: "Lançamentos de caixa" };

export default async function LancamentosPage() {
  await requirePermission("financeiro", "ver");
  const [dados, opcoes] = await Promise.all([dadosLivroCaixa(), opcoesLancamento()]);
  return <LancamentosView itens={dados.itens} contas={dados.contas} opcoes={opcoes} />;
}
