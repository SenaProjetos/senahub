import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { HORIZONTES_DIAS } from "@/modules/financeiro/config/liquidez";
import { baseDoPlanejador } from "@/modules/financeiro/liquidez/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { PlanejadorView } from "@/components/financeiro/planejador/planejador-view";

export const metadata: Metadata = { title: "Planejador de caixa" };

/**
 * Planejador de caixa (spec 2026-09-30). Ler e simular só exige VER o Financeiro (inclui o piso de
 * leitura do sócio): a simulação roda no navegador e não grava nada. Editar a reserva mínima exige
 * `financeiro:gerir` — a action confere de novo no servidor.
 */
export default async function PlanejadorPage({ searchParams }: { searchParams: Promise<{ horizonte?: string }> }) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const sp = await searchParams;
  const pedido = Number(sp.horizonte);
  const horizonte = (HORIZONTES_DIAS as readonly number[]).includes(pedido) ? pedido : undefined;

  const [base, config, podeGerir] = await Promise.all([
    baseDoPlanejador({ horizonteDias: horizonte }),
    getConfigLiquidez(),
    can(user, "financeiro", "gerir"),
  ]);

  return <PlanejadorView base={base} config={config} podeGerir={podeGerir} subnav={<NavFinanceiro />} />;
}
