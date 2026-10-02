import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { diaDeSaoPaulo } from "@/lib/data";
import { contasParaInvestir, detalheDoAtivo } from "@/modules/financeiro/investimentos/queries";
import { balancoGerencial } from "@/modules/financeiro/relatorios/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { AtivoView } from "@/components/financeiro/investimentos/ativo-view";

export const metadata: Metadata = { title: "Investimento" };

export default async function AtivoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");
  const { id } = await params;
  const [detalhe, contas, podeGerir, veResultados] = await Promise.all([
    detalheDoAtivo(id),
    contasParaInvestir(),
    can(user, "financeiro", "gerir"),
    can(user, "financeiro", "resultados"),
  ]);
  if (!detalhe) notFound();
  // O pedaço do Balanço só para quem vê os Resultados (o mesmo gate da tela do Balanço).
  const balanco = veResultados ? await balancoGerencial() : null;
  return <AtivoView detalhe={detalhe} contas={contas} balanco={balanco} podeGerir={podeGerir} hoje={diaDeSaoPaulo()} subnav={<NavFinanceiro />} />;
}
