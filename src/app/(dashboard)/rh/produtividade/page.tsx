import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { produtividadeProjetistas, type Granularidade } from "@/modules/rh/produtividade/queries";
import { ProdutividadeView } from "@/components/rh/produtividade-view";

export const metadata: Metadata = { title: "Produtividade — Projetistas" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  await requireRole(...HR_ADMIN_ROLES);
  const { g } = await searchParams;
  const granularidade: Granularidade = g === "mes" ? "mes" : "semana";
  const dados = await produtividadeProjetistas(granularidade);
  return (
    <ProdutividadeView
      periodos={dados.periodos}
      granularidade={dados.granularidade}
      projetistas={dados.projetistas}
    />
  );
}
