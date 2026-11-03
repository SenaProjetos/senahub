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

export const metadata: Metadata = { title: "Estudo — projeto" };

export default async function EstudoPage({ params }: { params: Promise<{ id: string; estudoId: string }> }) {
  const user = await requireInterno();
  await requirePermission("ferramentas", "usar");
  const { id, estudoId } = await params;
  const [projeto, liberacao] = await Promise.all([projetoVisivel(user, id), liberacaoDosEstudos(user)]);
  if (!projeto || !liberacao.liberado) notFound();

  // `estudoDoProjeto` recorta por projeto: um id de outro projeto não abre por esta rota.
  const [estudo, podeEditar, alteracoes, totalEstudos] = await Promise.all([
    estudoDoProjeto(id, estudoId),
    podeEditarEstudosDoProjeto(user, id),
    alteracoesDoEstudo(estudoId),
    contarEstudosDoProjeto(id),
  ]);
  if (!estudo) notFound();

  return (
    <EstudoEditor
      projetoId={id}
      estudo={{ id: estudo.id, nome: estudo.nome, versao: estudo.versao, atualizadoPor: estudo.atualizadoPor, atualizadoEm: estudo.atualizadoEm }}
      conteudoInicial={estudo.conteudo}
      podeEditar={podeEditar}
      emValidacao={liberacao.emValidacao}
      totalEstudos={totalEstudos}
      alteracoes={alteracoes}
    />
  );
}
