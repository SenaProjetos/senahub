import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModeloParaEditar } from "@/modules/inputs/modelo-queries";
import { EditorModeloBriefing } from "@/components/configuracoes/editor-modelo-briefing";

export const metadata: Metadata = { title: "Editar modelo de formulário" };

export default async function EditarModeloBriefingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("configuracoes", "gerir");
  const { id } = await params;
  const modelo = await obterModeloParaEditar(id);
  if (!modelo) notFound();
  // `key` no id: o rascunho vive no estado do editor; trocar de modelo remonta, salvar (refresh) não.
  return <EditorModeloBriefing key={modelo.id} modelo={modelo} />;
}
