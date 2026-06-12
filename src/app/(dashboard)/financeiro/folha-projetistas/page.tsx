import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarFolha } from "@/modules/financeiro/folha/queries";
import { opcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { FolhaView } from "@/components/financeiro/folha/folha-view";

export const metadata: Metadata = { title: "Folha de projetistas" };

export default async function FolhaProjetistasPage() {
  await requirePermission("financeiro", "ver");
  const [{ itens, pendente, pago }, opcoes] = await Promise.all([
    listarFolha(),
    opcoesLancamento(),
  ]);
  return (
    <FolhaView
      itens={itens}
      pendente={pendente}
      pago={pago}
      contas={opcoes.contas}
      formas={opcoes.formas}
    />
  );
}
