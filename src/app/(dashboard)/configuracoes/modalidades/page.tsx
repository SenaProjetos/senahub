import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarModalidades } from "@/modules/licitacoes/modalidades/queries";
import { ModalidadesView } from "@/components/configuracoes/modalidades-view";

export const metadata: Metadata = { title: "Modalidades de licitação" };

export default async function ModalidadesPage() {
  await requirePermission("licitacoes", "gerir");
  const modalidades = await listarModalidades(true);
  return <ModalidadesView modalidades={modalidades} />;
}
