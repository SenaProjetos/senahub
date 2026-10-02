import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lancamentosAguardando, limiteAprovacao } from "@/modules/financeiro/aprovacao/queries";
import { AprovacoesView } from "@/components/financeiro/aprovacoes-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Aprovações financeiras" };

export default async function AprovacoesPage() {
  const user = await requirePermission("financeiro", "aprovar");
  const [itens, limite, podeGerir, podeAprovar] = await Promise.all([
    // A alçada por valor é regra do servidor: a lista já chega sabendo o que ESTE usuário aprova.
    lancamentosAguardando(user),
    limiteAprovacao(),
    can(user, "financeiro", "gerir"),
    can(user, "financeiro", "aprovar"),
  ]);
  return (
    <AprovacoesView
      subnav={<NavFinanceiro />}
      itens={itens}
      limite={limite}
      podeGerir={podeGerir}
      podeAprovar={podeAprovar}
    />
  );
}
