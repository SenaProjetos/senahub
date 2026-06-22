import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarFolha } from "@/modules/financeiro/folha/queries";
import { listarFolhasProjetista } from "@/modules/financeiro/folha-lote/queries";
import { opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { FolhaView } from "@/components/financeiro/folha/folha-view";
import { FolhaLotesSection } from "@/components/financeiro/folha/folha-lotes-section";

export const metadata: Metadata = { title: "Folha de projetistas" };

export default async function FolhaProjetistasPage() {
  await requirePermission("financeiro", "ver");
  const [{ itens, pendente, pago }, opcoes, lotes] = await Promise.all([
    listarFolha(),
    opcoesLancamento(),
    listarFolhasProjetista(),
  ]);
  return (
    <div className="space-y-5">
      <FolhaLotesSection folhas={lotes} contas={opcoes.contas} formas={opcoes.formas} />
      <FolhaView
        itens={itens}
        pendente={pendente}
        pago={pago}
        contas={opcoes.contas}
        formas={opcoes.formas}
      />
    </div>
  );
}
