import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { catalogoDisciplinasAdmin } from "@/modules/projetos/queries";
import { DisciplinasCatalogoView } from "@/components/configuracoes/disciplinas-catalogo-view";

export const metadata: Metadata = { title: "Disciplinas" };

export default async function DisciplinasConfigPage() {
  await requirePermission("configuracoes", "disciplinas");
  const itens = await catalogoDisciplinasAdmin();
  return <DisciplinasCatalogoView itens={itens} />;
}
