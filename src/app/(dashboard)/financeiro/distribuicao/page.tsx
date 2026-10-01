import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { carregarRegras, categoriasDeReceita } from "@/modules/financeiro/distribuicao/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { RegrasView } from "@/components/financeiro/distribuicao/regras-view";

export const metadata: Metadata = { title: "Regras de distribuição" };

/**
 * Regras de distribuição (plano F5). Ler exige VER o Financeiro (inclui o piso de leitura do sócio);
 * criar, editar e excluir exigem `financeiro:gerir` — as actions conferem de novo no servidor.
 */
export default async function DistribuicaoPage() {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const [regras, categorias, caixinhas, podeGerir] = await Promise.all([
    carregarRegras(),
    categoriasDeReceita(),
    prisma.caixinha.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    can(user, "financeiro", "gerir"),
  ]);

  return <RegrasView regras={regras} caixinhas={caixinhas} categorias={categorias} podeGerir={podeGerir} subnav={<NavFinanceiro />} />;
}
