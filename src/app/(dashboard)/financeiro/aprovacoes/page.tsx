import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lancamentosAguardando, limiteAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { AprovacoesView } from "@/components/financeiro/aprovacoes-view";

export const metadata: Metadata = { title: "Aprovações financeiras" };

export default async function AprovacoesPage() {
  const user = await requirePermission("financeiro", "aprovar");
  const [itens, limite, podeGerir] = await Promise.all([
    lancamentosAguardando(),
    limiteAprovacao(),
    can(user.role, "financeiro", "gerir"),
  ]);
  return <AprovacoesView itens={itens} limite={limite} podeGerir={podeGerir} />;
}
