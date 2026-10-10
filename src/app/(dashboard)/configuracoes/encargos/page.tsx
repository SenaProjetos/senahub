import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";

import { faixasPorTipo, deducaoDependente } from "@/modules/rh/encargos/queries";
import { EncargosView } from "@/components/configuracoes/encargos-view";

export const metadata: Metadata = { title: "Encargos da folha" };

export default async function EncargosPage() {
  await requireGestorRh();
  const [{ inss, irrf }, deducaoDep] = await Promise.all([faixasPorTipo(), deducaoDependente()]);
  return <EncargosView inss={inss} irrf={irrf} deducaoDep={deducaoDep} />;
}
