import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { listarArtsDoProjeto, responsaveisDisponiveis, disciplinasParaArt } from "@/modules/projetos/art/queries";
import { ArtsView } from "@/components/projetos/arts-view";

export const metadata: Metadata = { title: "ARTs — projeto" };

export default async function ArtsProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [arts, responsaveis, disciplinas, podeGerir] = await Promise.all([
    listarArtsDoProjeto(id),
    responsaveisDisponiveis(),
    disciplinasParaArt(id),
    can(user, "projetos", "gerir"),
  ]);

  return (
    <ArtsView
      projetoId={id}
      arts={arts}
      responsaveis={responsaveis}
      disciplinas={disciplinas}
      podeGerir={podeGerir}
    />
  );
}
