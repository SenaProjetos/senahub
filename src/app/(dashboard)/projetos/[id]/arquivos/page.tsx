import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arquivosDoProjeto } from "@/modules/projetos/arquivos/queries";
import { ArquivosView } from "@/components/projetos/arquivos-view";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [arquivos, podeGerir] = await Promise.all([
    arquivosDoProjeto(id),
    can(user.role, "projetos", "gerir"),
  ]);
  return <ArquivosView projeto={projeto} arquivos={arquivos} podeGerir={podeGerir} />;
}
