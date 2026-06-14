import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { servicosDoProjeto, fornecedoresAtivos } from "@/modules/projetos/servicos/queries";
import { ServicosView } from "@/components/projetos/servicos-view";

export const metadata: Metadata = { title: "Serviços terceirizados" };

export default async function ServicosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [servicos, fornecedores, podeGerir] = await Promise.all([
    servicosDoProjeto(id),
    fornecedoresAtivos(),
    can(user.role, "projetos", "gerir"),
  ]);
  return <ServicosView projeto={projeto} servicos={servicos} fornecedores={fornecedores} podeGerir={podeGerir} />;
}
