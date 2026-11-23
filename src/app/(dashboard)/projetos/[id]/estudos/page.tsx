import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno, requirePermission } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { tipoDeEstudoValido } from "@/modules/estudos/acesso";
import { estudosDoProjeto, liberacaoDosEstudos, podeEditarEstudosDoProjeto, tiposLiberadosParaPessoa } from "@/modules/estudos/queries";
import { EstudosView } from "@/components/estudos/estudos-view";

export const metadata: Metadata = { title: "Estudos — projeto" };

export default async function EstudosProjetoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  // Levantamento de cargas é dado interno e usa as calculadoras: interno + `ferramentas:usar` + enxergar o
  // projeto. Motor em validação: 404 para quem não gere as ferramentas (a aba nem aparece para essa pessoa).
  const user = await requireInterno();
  await requirePermission("ferramentas", "usar");
  const { id } = await params;
  const { novo } = await searchParams;
  const [projeto, liberacao] = await Promise.all([projetoVisivel(user, id), liberacaoDosEstudos(user)]);
  if (!projeto || !liberacao.liberado) notFound();

  // Cada tipo de estudo segue a validação do próprio motor: o que ainda está em validação não aparece (nem se cria)
  // para quem não gere as ferramentas.
  const tiposLiberados = await tiposLiberadosParaPessoa(user);
  const [estudos, podeEditar] = await Promise.all([estudosDoProjeto(id, tiposLiberados), podeEditarEstudosDoProjeto(user, id)]);

  return <EstudosView projetoId={id} estudos={estudos} podeEditar={podeEditar} emValidacao={liberacao.emValidacao} tiposLiberados={tiposLiberados} abrirNovoDoTipo={tipoDeEstudoValido(novo) && tiposLiberados.includes(novo) ? novo : null} />;
}
