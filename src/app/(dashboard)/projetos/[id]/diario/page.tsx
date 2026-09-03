import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { diarioDoProjeto } from "@/modules/projetos/diario/queries";
import { DiarioView } from "@/components/projetos/diario-view";

export const metadata: Metadata = { title: "Diário — projeto" };

export default async function DiarioProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  // F4 (2026-09-02): o par próprio da aba, não `projetos:ver`. Esconder a aba no layout sem
  // fechar a página deixaria a permissão valendo só como enfeite de menu — a URL continuaria
  // aberta. Semeado para quem tem `projetos:ver`, então ninguém perdeu acesso.
  // A regra "cliente nunca vê" virou a própria semente de `projetos:diario`, que exclui o
  // perfil do portal — deixou de ser um `if` de papel aqui.
  const user = await requirePermission("projetos", "diario");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const disciplinas = await diarioDoProjeto(user, id);

  return <DiarioView disciplinas={disciplinas} projetoId={id} />;
}
