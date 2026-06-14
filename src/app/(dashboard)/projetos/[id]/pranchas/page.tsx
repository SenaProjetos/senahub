import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { pranchasDoProjeto } from "@/modules/projetos/pranchas/queries";
import { PranchasView } from "@/components/projetos/pranchas-view";

export const metadata: Metadata = { title: "Pranchas" };

export default async function PranchasPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [disciplinas, podeGerir] = await Promise.all([
    pranchasDoProjeto(id),
    can(user.role, "projetos", "gerir"),
  ]);
  return <PranchasView projeto={projeto} disciplinas={disciplinas} podeGerir={podeGerir} />;
}
