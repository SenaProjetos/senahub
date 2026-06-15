import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarOportunidades, opcoesOportunidade } from "@/modules/comercial/oportunidades/queries";
import { OportunidadesView } from "@/components/comercial/oportunidades-view";

export const metadata: Metadata = { title: "Oportunidades" };

export default async function OportunidadesPage() {
  const user = await requirePermission("comercial", "ver");
  const [oportunidades, opcoes, podeGerir] = await Promise.all([
    listarOportunidades(),
    opcoesOportunidade(),
    can(user.role, "comercial", "gerir"),
  ]);
  return <OportunidadesView oportunidades={oportunidades} opcoes={opcoes} podeGerir={podeGerir} />;
}
