import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { extrasDoProjeto } from "@/modules/projetos/extras/queries";
import { ExtrasView } from "@/components/projetos/extras-view";

export const metadata: Metadata = { title: "Mais — projeto" };

export default async function ExtrasPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [dados, podeGerir] = await Promise.all([
    extrasDoProjeto(id),
    can(user.role, "projetos", "gerir"),
  ]);
  return <ExtrasView projeto={projeto} dados={dados} podeGerir={podeGerir} />;
}
