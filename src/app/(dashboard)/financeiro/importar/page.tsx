import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarImportacoes } from "@/modules/financeiro/importacao/queries";
import { ImportadorView } from "@/components/financeiro/importacao/importador-view";

export const metadata: Metadata = { title: "Importar dados financeiros" };

export default async function ImportarFinanceiroPage() {
  await requirePermission("financeiro", "gerir");
  const importacoes = await listarImportacoes();
  return <ImportadorView importacoes={importacoes} />;
}
