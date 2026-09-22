import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { catalogoDisciplinasAdmin } from "@/modules/projetos/queries";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { DisciplinasCatalogoView } from "@/components/configuracoes/disciplinas-catalogo-view";

export const metadata: Metadata = { title: "Disciplinas" };

export default async function DisciplinasConfigPage() {
  await requirePermission("configuracoes", "disciplinas");
  const [itens, versoes] = await Promise.all([catalogoDisciplinasAdmin(), listarVersoesAdmin()]);
  return <DisciplinasCatalogoView itens={itens} versoes={versoes} />;
}
