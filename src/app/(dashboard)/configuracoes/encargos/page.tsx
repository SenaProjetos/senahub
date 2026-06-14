import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { faixasPorTipo, deducaoDependente } from "@/modules/rh/encargos/queries";
import { EncargosView } from "@/components/configuracoes/encargos-view";

export const metadata: Metadata = { title: "Encargos da folha" };

export default async function EncargosPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const [{ inss, irrf }, deducaoDep] = await Promise.all([faixasPorTipo(), deducaoDependente()]);
  return <EncargosView inss={inss} irrf={irrf} deducaoDep={deducaoDep} />;
}
