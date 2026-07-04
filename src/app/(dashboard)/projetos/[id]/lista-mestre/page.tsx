import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import {
  pranchasDoProjeto,
  catalogosPrancha,
  catalogosPranchaConfig,
} from "@/modules/projetos/pranchas/queries";
import { nomenclaturaDoProjeto, nomenclaturaGlobal } from "@/modules/projetos/nomenclatura/queries";
import { ListaMestreView } from "@/components/projetos/lista-mestre-view";

export const metadata: Metadata = { title: "Lista Mestre" };

export default async function ListaMestrePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const [disciplinas, catalogos, catalogosProjeto, nomenclaProjeto, nomenclaGlobal, podeGerir, podeConfigSiglas] =
    await Promise.all([
      pranchasDoProjeto(id),
      catalogosPrancha(id),
      catalogosPranchaConfig(id),
      nomenclaturaDoProjeto(id),
      nomenclaturaGlobal(),
      can(user.role, "projetos", "gerir"),
      can(user.role, "configuracoes", "gerir"),
    ]);
  return (
    <ListaMestreView
      projeto={projeto}
      disciplinas={disciplinas}
      catalogos={catalogos}
      catalogosProjeto={catalogosProjeto}
      nomenclaturaProjeto={nomenclaProjeto}
      nomenclaturaGlobal={nomenclaGlobal}
      podeGerir={podeGerir}
      podeConfigSiglas={podeConfigSiglas}
    />
  );
}
