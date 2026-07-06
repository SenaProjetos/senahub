import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { catalogoDisciplinasAdmin } from "@/modules/projetos/queries";
import { DisciplinasCatalogoView } from "@/components/configuracoes/disciplinas-catalogo-view";

export const metadata: Metadata = { title: "Disciplinas" };

export default async function DisciplinasConfigPage() {
  await requireRole("admin", "supervisor");
  const itens = await catalogoDisciplinasAdmin();
  return <DisciplinasCatalogoView itens={itens} />;
}
