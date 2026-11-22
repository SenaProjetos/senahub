import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno } from "@/lib/session";
import { conversaParaEquipe } from "@/modules/portal/mensagens/queries";
import { ConversaEquipe } from "@/components/mensagens-cliente/conversa-equipe";

export const metadata: Metadata = { title: "Cliente — projeto" };

/**
 * Aba Cliente: a conversa do cliente do portal com a coordenação. Só a audiência da conversa (`podeVerConversa`,
 * dentro de `conversaParaEquipe`) chega aqui; os demais — projetista, cliente do portal — recebem 404.
 */
export default async function ClienteProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInterno();
  const { id } = await params;
  const conversa = await conversaParaEquipe(id, user.id);
  if (!conversa) notFound();
  return <ConversaEquipe projetoId={id} inicial={conversa} />;
}
