import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { dadosLivroCaixa, opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { getConfigExclusao } from "@/modules/financeiro/config/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { LancamentosView } from "@/components/financeiro/lancamentos/lancamentos-view";

export const metadata: Metadata = { title: "Lançamentos de caixa" };

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ projetoId?: string; novo?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const { projetoId, novo } = await searchParams;
  const [dados, opcoes, exclusao, modelosDoc] = await Promise.all([
    dadosLivroCaixa(),
    opcoesLancamento(),
    getConfigExclusao(),
    modelosPorFonte("lancamentos"),
  ]);
  return (
    <LancamentosView
      itens={dados.itens}
      contas={dados.contas}
      opcoes={opcoes}
      exigeSenhaExclusao={exclusao.exigir}
      modelosDoc={modelosDoc}
      defaultProjetoId={projetoId}
      defaultFormOpen={novo === "1"}
    />
  );
}
