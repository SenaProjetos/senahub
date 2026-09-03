import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { extrasDoProjeto } from "@/modules/projetos/extras/queries";
import { ExtrasView } from "@/components/projetos/extras-view";
import { acessosDoProjeto, viewerDe } from "@/modules/acessos/queries";
import { AcessosDoProjeto } from "@/components/acessos/acessos-do-projeto";

export const metadata: Metadata = { title: "Mais — projeto" };

export default async function ExtrasPage({ params }: { params: Promise<{ id: string }> }) {
  // F4 (2026-09-02): o par próprio da aba, não `projetos:ver`. Esconder a aba no layout sem
  // fechar a página deixaria a permissão valendo só como enfeite de menu — a URL continuaria
  // aberta. Semeado para quem tem `projetos:ver`, então ninguém perdeu acesso.
  const user = await requirePermission("projetos", "extras");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [dados, podeGerir, podeVerAcessos] = await Promise.all([
    extrasDoProjeto(id),
    can(user, "projetos", "gerir"),
    can(user, "acessos", "ver"),
  ]);

  // §39 — a seção só é consultada para quem tem a tela de Acessos; a lista em si ainda passa
  // pelo escopo do COFRE, então ter a permissão não revela credencial que não seja sua.
  const acessos = podeVerAcessos ? await acessosDoProjeto(viewerDe(user), id) : [];

  return (
    <div className="space-y-4">
      <ExtrasView projeto={projeto} dados={dados} podeGerir={podeGerir} />
      <AcessosDoProjeto acessos={acessos} />
    </div>
  );
}
