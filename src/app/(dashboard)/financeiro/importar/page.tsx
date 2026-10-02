import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarImportacoes } from "@/modules/financeiro/importacao/queries";
import { ImportadorView } from "@/components/financeiro/importacao/importador-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Importar planilha" };

export default async function ImportarFinanceiroPage() {
  await requirePermission("financeiro", "conciliar");
  const importacoes = await listarImportacoes();
  return <ImportadorView subnav={<NavFinanceiro />} importacoes={importacoes} />;
}
