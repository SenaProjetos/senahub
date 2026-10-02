import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { diaDeSaoPaulo } from "@/lib/data";
import { carregarCartoes, faturasDoCartao } from "@/modules/financeiro/cartoes/queries";
import { opcoesDosCartoes } from "@/modules/financeiro/cartoes/opcoes";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { CartoesView } from "@/components/financeiro/cartoes/cartoes-view";

export const metadata: Metadata = { title: "Cartões de crédito" };

/**
 * Cartões de crédito (M3). Ler exige VER o Financeiro; cadastrar cartão, lançar compra e pagar fatura
 * exigem `financeiro:gerir` — as actions conferem de novo no servidor.
 */
export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ cartao?: string }> }) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const { cartao } = await searchParams;
  const [cartoes, opcoes, podeGerir] = await Promise.all([carregarCartoes(), opcoesDosCartoes(), can(user, "financeiro", "gerir")]);
  const atual = cartoes.find((c) => c.id === cartao) ?? cartoes[0] ?? null;
  const faturas = atual ? await faturasDoCartao(atual.id) : [];

  return (
    <CartoesView
      cartoes={cartoes}
      cartaoAtual={atual}
      faturas={faturas}
      opcoes={opcoes}
      podeGerir={podeGerir}
      hoje={diaDeSaoPaulo()}
      subnav={<NavFinanceiro />}
    />
  );
}
