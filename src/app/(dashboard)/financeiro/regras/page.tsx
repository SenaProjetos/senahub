import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { carregarRegrasDePreenchimento, opcoesDasRegras } from "@/modules/financeiro/regras/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { RegrasPreenchimentoView } from "@/components/financeiro/regras/regras-view";

export const metadata: Metadata = { title: "Regras de preenchimento" };

/**
 * Regras de preenchimento (M2). Ler exige VER o Financeiro; criar, editar, ordenar e excluir exigem
 * `financeiro:gerir` — as actions conferem de novo no servidor.
 */
export default async function RegrasPreenchimentoPage() {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const [regras, opcoes, podeGerir] = await Promise.all([carregarRegrasDePreenchimento(), opcoesDasRegras(), can(user, "financeiro", "gerir")]);

  return <RegrasPreenchimentoView regras={regras} opcoes={opcoes} podeGerir={podeGerir} subnav={<NavFinanceiro />} />;
}
