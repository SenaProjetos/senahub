import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireInterno, requirePermission } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { problemasDoProjeto } from "@/modules/projetos/pendencias/queries";
import { ProblemasView } from "@/components/projetos/problemas-view";

export const metadata: Metadata = { title: "Problemas — projeto" };

export default async function ProblemasProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  // `problemasDoProjeto` só filtra as LINHAS (quem abre a prancha de cada uma); o acesso à página
  // fica nestes portões, obrigatórios. Cliente do portal não vê (404); interno precisa enxergar
  // arquivos e o projeto.
  const user = await requireInterno();
  await requirePermission("arquivos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [linhas, podeValidar] = await Promise.all([
    problemasDoProjeto(id, user),
    can(user, "uploads", "validar"),
  ]);

  return (
    <ProblemasView
      projetoId={id}
      linhas={linhas}
      usuarioId={user.id}
      // Mesmo critério do visualizador da prancha (`ehAdmin={user.superUsuario}`).
      ehAdmin={user.superUsuario}
      podeValidar={podeValidar}
    />
  );
}
