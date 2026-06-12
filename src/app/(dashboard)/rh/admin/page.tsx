import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { abonosPendentes, feriasPendentes, climaResumo } from "@/modules/rh/queries";
import { RhAdminView } from "@/components/rh/rh-admin-view";

export const metadata: Metadata = { title: "RH — administração" };

export default async function RhAdminPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const [abonos, ferias, clima] = await Promise.all([
    abonosPendentes(),
    feriasPendentes(),
    climaResumo(),
  ]);
  return <RhAdminView abonos={abonos} ferias={ferias} clima={clima} />;
}
