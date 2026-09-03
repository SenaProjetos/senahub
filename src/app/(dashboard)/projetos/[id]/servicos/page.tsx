import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { servicosDoProjeto, fornecedoresAtivos } from "@/modules/projetos/servicos/queries";
import { ServicosView } from "@/components/projetos/servicos-view";

export const metadata: Metadata = { title: "Serviços terceirizados" };

export default async function ServicosPage({ params }: { params: Promise<{ id: string }> }) {
  // F4 (2026-09-02): o par próprio da aba, não `projetos:ver`. Esconder a aba no layout sem
  // fechar a página deixaria a permissão valendo só como enfeite de menu — a URL continuaria
  // aberta. Semeado para quem tem `projetos:ver`, então ninguém perdeu acesso.
  const user = await requirePermission("projetos", "servicos");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [servicos, fornecedores, podeGerir] = await Promise.all([
    servicosDoProjeto(id),
    fornecedoresAtivos(),
    can(user, "projetos", "gerir"),
  ]);
  return <ServicosView projeto={projeto} servicos={servicos} fornecedores={fornecedores} podeGerir={podeGerir} />;
}
