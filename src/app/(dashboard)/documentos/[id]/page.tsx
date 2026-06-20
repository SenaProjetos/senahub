import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo } from "@/modules/documentos/queries";
import { listarBlocos } from "@/modules/documentos/bloco-queries";
import { fontesHabilitadas } from "@/modules/documentos/fontes-config";
import { fontesPermitidasOpcoes } from "@/modules/documentos/fontes-perm";
import { listarDatasetsParaFonte, colunasDoDataset } from "@/modules/documentos/dataset-queries";
import { isFonteDataset, DATASET_PREFIX } from "@/modules/documentos/fontes";
import { DocEditorDynamic as DocEditor } from "@/components/documentos/editor/editor-dynamic";

export const metadata: Metadata = { title: "Editor de documento" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("documentos", "gerir");
  const { id } = await params;
  const [modelo, fontes, blocos, fontesDados, datasets] = await Promise.all([
    obterModelo(id),
    fontesHabilitadas(),
    listarBlocos(user.id),
    fontesPermitidasOpcoes(user.role),
    listarDatasetsParaFonte(),
  ]);
  if (!modelo) notFound();

  // Se a fonte atual é um dataset, expõe suas colunas como tokens insertáveis.
  const fonteColunas = isFonteDataset(modelo.fonte)
    ? await colunasDoDataset(modelo.fonte!.slice(DATASET_PREFIX.length))
    : [];

  return (
    <DocEditor
      modeloId={modelo.id}
      nomeInicial={modelo.nome}
      tipoInicial={modelo.tipo}
      fonteInicial={modelo.fonte ?? ""}
      schemaInicial={modelo.schema}
      fontesHabilitadas={fontes}
      fontesDados={fontesDados}
      datasets={datasets}
      fonteColunas={fonteColunas}
      blocos={blocos}
      versoes={modelo.versoes.map((v) => ({
        id: v.id,
        numero: v.numero,
        autor: v.autor.name,
        data: v.createdAt.toISOString(),
      }))}
    />
  );
}
