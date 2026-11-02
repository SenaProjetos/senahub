import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno, requirePermission } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { estudosDoProjeto, liberacaoDosEstudos, podeEditarEstudosDoProjeto } from "@/modules/estudos/queries";
import { EstudosView } from "@/components/estudos/estudos-view";

export const metadata: Metadata = { title: "Estudos — projeto" };

export default async function EstudosProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  // Levantamento de cargas é dado interno e usa as calculadoras: interno + `ferramentas:usar` + enxergar o
  // projeto. Motor em validação: 404 para quem não gere as ferramentas (a aba nem aparece para essa pessoa).
  const user = await requireInterno();
  await requirePermission("ferramentas", "usar");
  const { id } = await params;
  const [projeto, liberacao] = await Promise.all([projetoVisivel(user, id), liberacaoDosEstudos(user)]);
  if (!projeto || !liberacao.liberado) notFound();

  const [estudos, podeEditar] = await Promise.all([estudosDoProjeto(id), podeEditarEstudosDoProjeto(user, id)]);

  return <EstudosView projetoId={id} estudos={estudos} podeEditar={podeEditar} emValidacao={liberacao.emValidacao} />;
}
