import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diaLocal } from "@/modules/ponto/engine";
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import {
  horasProjetistas,
  produtividadeProjetistas,
  type Granularidade,
} from "@/modules/rh/produtividade/queries";
import { ProdutividadeView } from "@/components/rh/produtividade-view";

export const metadata: Metadata = { title: "Produtividade — Projetistas" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; de?: string; ate?: string }>;
}) {
  const user = await requirePermission("rh", "produtividade");
  const sp = await searchParams;
  const granularidade: Granularidade = sp.g === "mes" ? "mes" : "semana";
  const hoje = diaLocal(new Date());
  const periodo = resolverPeriodo({ de: sp.de, ate: sp.ate }, hoje);
  const [dados, horas, podeVerEspelho] = await Promise.all([
    produtividadeProjetistas(granularidade),
    horasProjetistas(periodo),
    can(user, "ponto", "espelho_equipe"),
  ]);
  return (
    <ProdutividadeView
      periodos={dados.periodos}
      granularidade={dados.granularidade}
      projetistas={dados.projetistas}
      horas={horas}
      periodo={periodo}
      hoje={hoje}
      podeVerEspelho={podeVerEspelho}
    />
  );
}
