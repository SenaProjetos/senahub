import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo } from "@/modules/documentos/queries";
import { listarBlocos } from "@/modules/documentos/bloco-queries";
import { fontesHabilitadas } from "@/modules/documentos/fontes-config";
import { DocEditorDynamic as DocEditor } from "@/components/documentos/editor/editor-dynamic";

export const metadata: Metadata = { title: "Editor de documento" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("documentos", "gerir");
  const { id } = await params;
  const [modelo, fontes, blocos] = await Promise.all([
    obterModelo(id),
    fontesHabilitadas(),
    listarBlocos(user.id),
  ]);
  if (!modelo) notFound();

  return (
    <DocEditor
      modeloId={modelo.id}
      nomeInicial={modelo.nome}
      tipoInicial={modelo.tipo}
      fonteInicial={modelo.fonte ?? ""}
      schemaInicial={modelo.schema}
      fontesHabilitadas={fontes}
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
