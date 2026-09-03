import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { listarArtsDoProjeto, responsaveisDisponiveis, disciplinasParaArt } from "@/modules/projetos/art/queries";
import { ArtsView } from "@/components/projetos/arts-view";

export const metadata: Metadata = { title: "ARTs — projeto" };

export default async function ArtsProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  // F4 (2026-09-02): o par próprio da aba, não `projetos:ver`. Esconder a aba no layout sem
  // fechar a página deixaria a permissão valendo só como enfeite de menu — a URL continuaria
  // aberta. Semeado para quem tem `projetos:ver`, então ninguém perdeu acesso.
  const user = await requirePermission("projetos", "arts");
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
