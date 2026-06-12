import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo } from "@/modules/documentos/queries";
import { DocEditor } from "@/components/documentos/editor/editor";

export const metadata: Metadata = { title: "Editor de documento" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("documentos", "gerir");
  const { id } = await params;
  const modelo = await obterModelo(id);
  if (!modelo) notFound();

  return (
    <DocEditor
      modeloId={modelo.id}
      nomeInicial={modelo.nome}
      tipoInicial={modelo.tipo}
      fonteInicial={modelo.fonte ?? ""}
      schemaInicial={modelo.schema}
      versoes={modelo.versoes.map((v) => ({
        id: v.id,
        numero: v.numero,
        autor: v.autor.name,
        data: v.createdAt.toISOString(),
      }))}
    />
  );
}
