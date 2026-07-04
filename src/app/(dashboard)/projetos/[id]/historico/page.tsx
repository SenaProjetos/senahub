import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { historicoDocumentosProjeto } from "@/modules/projetos/historico/queries";
import { HistoricoView } from "@/components/projetos/historico-view";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoricoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  // Visibilidade restrita: admin (bypass) ou cargos com projetos:historico. Esconde a existência.
  if (!(await can(user.role, "projetos", "historico"))) notFound();

  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const sp = await searchParams;
  const historico = await historicoDocumentosProjeto(id, { page: sp.page ? Number(sp.page) : 1 });

  return <HistoricoView projeto={projeto} historico={historico} />;
}
