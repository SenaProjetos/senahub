import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarCampanhas, canaisAtivos, responsaveisAtivos } from "@/modules/comercial/queries";
import { CampanhasView } from "@/components/comercial/campanhas-view";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampanhasPage() {
  await requirePermission("comercial", "gerir");
  const [campanhas, canais, responsaveis] = await Promise.all([
    listarCampanhas(),
    canaisAtivos(),
    responsaveisAtivos(),
  ]);
  return <CampanhasView campanhas={campanhas} canais={canais} responsaveis={responsaveis} />;
}
