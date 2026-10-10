import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarTiposEmpreendimento } from "@/modules/projetos/tipos-empreendimento/queries";
import { TiposEmpreendimentoView } from "@/components/configuracoes/tipos-empreendimento-view";

export const metadata: Metadata = { title: "Tipos de empreendimento" };

export default async function TiposEmpreendimentoPage() {
  await requirePermission("projetos", "gerir");
  const { tipos, fases } = await listarTiposEmpreendimento();
  return <TiposEmpreendimentoView tipos={tipos} fases={fases} />;
}
