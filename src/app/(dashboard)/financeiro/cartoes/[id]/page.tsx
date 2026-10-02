import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { diaDeSaoPaulo } from "@/lib/data";
import { carregarCartoes, faturaComCompras } from "@/modules/financeiro/cartoes/queries";
import { opcoesDosCartoes } from "@/modules/financeiro/cartoes/opcoes";
import { cicloDaCompra } from "@/modules/financeiro/cartoes/ciclo";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { FaturaView } from "@/components/financeiro/cartoes/fatura-view";

export const metadata: Metadata = { title: "Fatura do cartão" };

/** Uma fatura do cartão (`?fatura=YYYY-MM`; sem ela, a do ciclo em curso). */
export default async function FaturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fatura?: string }>;
}) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const { id } = await params;
  const { fatura } = await searchParams;
  const hoje = diaDeSaoPaulo();
  const [cartoes, opcoes, podeGerir] = await Promise.all([carregarCartoes(), opcoesDosCartoes(), can(user, "financeiro", "gerir")]);
  const cartao = cartoes.find((c) => c.id === id);
  if (!cartao) notFound();

  const competencia = /^\d{4}-\d{2}$/.test(fatura ?? "") ? fatura! : cicloDaCompra(cartao, hoje).competencia;
  const dados = await faturaComCompras(cartao.id, competencia);
  if (!dados) notFound();

  return (
    <FaturaView
      cartao={cartao}
      fatura={dados.fatura}
      compras={dados.compras}
      opcoes={opcoes}
      podeGerir={podeGerir}
      hoje={hoje}
      subnav={<NavFinanceiro />}
    />
  );
}
