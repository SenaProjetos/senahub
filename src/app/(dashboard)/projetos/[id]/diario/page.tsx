import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { INTERNAL_ROLES } from "@/lib/roles";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { diarioDoProjeto } from "@/modules/projetos/diario/queries";
import { DiarioView } from "@/components/projetos/diario-view";

export const metadata: Metadata = { title: "Diário — projeto" };

export default async function DiarioProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  // Diário é só p/ equipe interna — cliente nunca vê (mesma regra da aba/nav).
  if (!INTERNAL_ROLES.includes(user.role as never)) notFound();
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const disciplinas = await diarioDoProjeto(user, id);

  return <DiarioView disciplinas={disciplinas} projetoId={id} />;
}
