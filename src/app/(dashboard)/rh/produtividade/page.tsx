import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import {
  horasDiariasProjetistas,
  produtividadeProjetistas,
  type Granularidade,
} from "@/modules/rh/produtividade/queries";
import { ProdutividadeView } from "@/components/rh/produtividade-view";

export const metadata: Metadata = { title: "Produtividade — Projetistas" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  await requirePermission("rh", "produtividade");
  const { g } = await searchParams;
  const granularidade: Granularidade = g === "mes" ? "mes" : "semana";
  const [dados, horasDiarias] = await Promise.all([
    produtividadeProjetistas(granularidade),
    horasDiariasProjetistas(),
  ]);
  return (
    <ProdutividadeView
      periodos={dados.periodos}
      granularidade={dados.granularidade}
      projetistas={dados.projetistas}
      horasDiarias={horasDiarias}
    />
  );
}
