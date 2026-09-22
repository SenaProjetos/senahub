import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { versaoVigenteHoje } from "@/modules/projetos/nomenclatura/versoes-queries";
import { valeNaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { motivosPerdaAtivos } from "@/modules/comercial/queries";
import { propostaCompostaParaEditor } from "@/modules/comercial/proposta-composta/queries";
import { ComporPropostaView } from "@/components/comercial/compor-proposta-view";

export const metadata: Metadata = { title: "Compor proposta" };

/** Editor da proposta composta (ADR-0006). Proposta que não é composta cai em 404: o editor de
 *  itens/condições e a externa têm cada um o seu caminho. */
export default async function ComporPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("comercial", "gerir");
  const { id } = await params;
  const [proposta, catalogoBruto, config, motivos, versaoVigente] = await Promise.all([
    propostaCompostaParaEditor(id),
    catalogoDisciplinas(),
    getConfigComercial(),
    motivosPerdaAtivos(),
    versaoVigenteHoje(),
  ]);
  if (!proposta) notFound();
  // D11 da spec de nomenclatura versionada: proposta nova oferece os cards válidos na versão
  // vigente hoje (proxy de "o projeto que vai nascer dela"). Cards já usados nos itens desta
  // proposta continuam na lista mesmo fora da versão — trocar de versão não pode fazer um item
  // já escolhido sumir do seletor.
  const jaUsados = new Set(proposta.itens.map((i) => i.disciplina));
  const disciplinas = catalogoBruto.filter((d) => jaUsados.has(d.nome) || !versaoVigente || valeNaVersao(d, versaoVigente.numero));
  return (
    <ComporPropostaView
      proposta={proposta}
      disciplinas={disciplinas.map((d) => d.nome)}
      descontoMaxSemJustificativa={config.descontoMaxSemJustificativa}
      baseUrl={process.env.APP_URL ?? ""}
      motivosPerda={motivos}
    />
  );
}
