import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno, requirePermission } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import {
  alteracoesDoEstudo,
  contarEstudosDoProjeto,
  estudoDoProjeto,
  liberacaoDosEstudos,
  podeEditarEstudosDoProjeto,
} from "@/modules/estudos/queries";
import { EstudoEditor } from "@/components/estudos/estudo-editor";
import { EstudoCargasDemandaEditor } from "@/components/estudos/cargas-demanda/editor";

export const metadata: Metadata = { title: "Estudo — projeto" };

export default async function EstudoPage({ params }: { params: Promise<{ id: string; estudoId: string }> }) {
  const user = await requireInterno();
  await requirePermission("ferramentas", "usar");
  const { id, estudoId } = await params;
  // `estudoDoProjeto` recorta por projeto: um id de outro projeto não abre por esta rota.
  const [projeto, estudo] = await Promise.all([projetoVisivel(user, id), estudoDoProjeto(id, estudoId)]);
  if (!projeto || !estudo) notFound();
  // A liberação é a do motor DESTE tipo de estudo (cada um tem a sua validação).
  const liberacao = await liberacaoDosEstudos(user, estudo.tipo);
  if (!liberacao.liberado) notFound();

  const [podeEditar, alteracoes, totalEstudos] = await Promise.all([
    podeEditarEstudosDoProjeto(user, id),
    alteracoesDoEstudo(estudoId),
    contarEstudosDoProjeto(id),
  ]);
  const resumo = { id: estudo.id, nome: estudo.nome, versao: estudo.versao, atualizadoPor: estudo.atualizadoPor, atualizadoEm: estudo.atualizadoEm };

  if (estudo.tipo === "cargas_demanda") {
    return (
      <EstudoCargasDemandaEditor
        projetoId={id}
        estudo={resumo}
        conteudoInicial={estudo.conteudo}
        podeEditar={podeEditar}
        emValidacao={liberacao.emValidacao}
        totalEstudos={totalEstudos}
        alteracoes={alteracoes}
      />
    );
  }

  return (
    <EstudoEditor
      projetoId={id}
      estudo={resumo}
      conteudoInicial={estudo.conteudo}
      podeEditar={podeEditar}
      emValidacao={liberacao.emValidacao}
      totalEstudos={totalEstudos}
      alteracoes={alteracoes}
    />
  );
}
